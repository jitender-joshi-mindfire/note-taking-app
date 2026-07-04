import jwt from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRY = "15m";

interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return jwt.verify(token, secret) as AccessTokenPayload;
}
