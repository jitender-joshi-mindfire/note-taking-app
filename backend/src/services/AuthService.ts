import type { AuthTokens, AuthUser } from "@note-taking-app/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { comparePassword, generateRefreshToken, hashPassword, hashToken } from "../lib/hash.js";
import { signAccessToken } from "../lib/jwt.js";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class DuplicateEmailError extends Error {}
export class InvalidCredentialsError extends Error {}
export class InvalidRefreshTokenError extends Error {}

interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

function toAuthUser(user: { id: string; email: string; createdAt: Date }): AuthUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}

async function issueRefreshToken(userId: string): Promise<string> {
  const rawToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

export async function register(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await hashPassword(password);

  // Rely on the DB's unique constraint as the sole source of truth for uniqueness —
  // a separate findUnique-then-create pre-check would leave a race window where two
  // concurrent registrations for the same email could both pass the check before
  // either insert commits. Catching the constraint violation here is atomic.
  let user;
  try {
    user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DuplicateEmailError();
    }
    throw err;
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  return { user: toAuthUser(user), accessToken, refreshToken };
}

// A precomputed bcrypt hash (same cost factor as real password hashes) with no
// corresponding real password. Used to keep login's timing constant regardless of
// whether the email exists — see comment in login() below.
const DUMMY_PASSWORD_HASH = "$2b$12$0q5ckLy7X6MEP.AsAfSFE..JN9xJcxNtG1/kxb83UMqLwvZOUHYxa";

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  // Always run a bcrypt comparison, even when the user doesn't exist, comparing
  // against a fixed dummy hash if necessary. Without this, "no such account"
  // returns near-instantly while "wrong password" always pays bcrypt's cost, and
  // that timing gap lets an attacker enumerate valid emails despite the identical
  // response body/status (undermining FRS 3.2.2's anti-enumeration intent).
  const valid = await comparePassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    throw new InvalidCredentialsError();
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  return { user: toAuthUser(user), accessToken, refreshToken };
}

export async function logout(userId: string, refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const tokenRow = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!tokenRow || tokenRow.userId !== userId || tokenRow.revokedAt) {
    throw new InvalidRefreshTokenError();
  }

  await prisma.refreshToken.update({
    where: { id: tokenRow.id },
    data: { revokedAt: new Date() },
  });
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const tokenHash = hashToken(refreshToken);
  const tokenRow = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!tokenRow) {
    throw new InvalidRefreshTokenError();
  }

  if (tokenRow.expiresAt < new Date()) {
    throw new InvalidRefreshTokenError();
  }

  const newRawToken = generateRefreshToken();

  // Atomically claim this token (WHERE requires revokedAt to still be null, so
  // concurrent requests can't both win), then issue its replacement and link the
  // two via rotatedToId — all in one interactive transaction, so a crash partway
  // through can't revoke the old token without ever issuing a replacement.
  const newToken = await prisma.$transaction(async (tx) => {
    const claim = await tx.refreshToken.updateMany({
      where: { id: tokenRow.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claim.count === 0) {
      return null;
    }

    const created = await tx.refreshToken.create({
      data: {
        userId: tokenRow.userId,
        tokenHash: hashToken(newRawToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    await tx.refreshToken.update({
      where: { id: tokenRow.id },
      data: { rotatedToId: created.id },
    });

    return created;
  });

  if (!newToken) {
    // Lost the claim — this token was already revoked. Only treat it as a
    // compromise signal (mass-revoke every session) if it was revoked via
    // ROTATION (rotatedToId set) — that means someone is replaying a stale,
    // already-superseded token. If it was revoked via logout (rotatedToId still
    // null), it's simply dead; reject normally without side effects, so a
    // retried logout call can't silently sign the user out of every device.
    const currentState = await prisma.refreshToken.findUnique({ where: { id: tokenRow.id } });
    if (currentState?.rotatedToId) {
      await prisma.refreshToken.updateMany({
        where: { userId: tokenRow.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new InvalidRefreshTokenError();
  }

  const accessToken = signAccessToken(tokenRow.userId);

  return { accessToken, refreshToken: newRawToken };
}
