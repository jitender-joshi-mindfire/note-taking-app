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

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
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
  // concurrent requests can't both win) and issue its replacement in the same
  // interactive transaction — matching design.md's "both in one prisma.$transaction"
  // decision, so a crash between the two statements can't revoke the old token
  // without ever issuing a replacement.
  const rotated = await prisma.$transaction(async (tx) => {
    const claim = await tx.refreshToken.updateMany({
      where: { id: tokenRow.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claim.count === 0) {
      return false;
    }

    await tx.refreshToken.create({
      data: {
        userId: tokenRow.userId,
        tokenHash: hashToken(newRawToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return true;
  });

  if (!rotated) {
    // Someone else already claimed/revoked this token first (or it was already
    // revoked, e.g. via logout) — reuse detected, treat as compromise.
    await prisma.refreshToken.updateMany({
      where: { userId: tokenRow.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new InvalidRefreshTokenError();
  }

  const accessToken = signAccessToken(tokenRow.userId);

  return { accessToken, refreshToken: newRawToken };
}
