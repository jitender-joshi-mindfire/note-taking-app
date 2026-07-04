## Context

First feature ticket after project setup (AB-1001). The codebase currently has no Prisma models
(`backend/prisma/schema.prisma` only has the generator/datasource blocks) and no backend source
beyond a health-check `backend/src/index.ts`. Everything in this design is net-new — there is no
existing auth code to extend or migrate.

## Goals / Non-Goals

**Goals:**
- Implement registration, login, logout, and JWT access/refresh token issuance exactly per the
  spec delta (`specs/user-auth/spec.md`).
- Refresh token rotation with reuse detection, per `docs/SDS.md` Section 4 (already documented
  there, not a new decision).
- Login/registration rate limiting (FRS 3.5, newly added).
- Establish the `requireAuth` middleware and Prisma client singleton that every future ticket's
  authenticated routes will reuse.

**Non-Goals:**
- Forgot password / OTP reset — AB-1003.
- Multi-instance-consistent rate limiting (e.g. Redis-backed) — single in-memory store is
  sufficient for this project's scope; out of scope to build distributed rate limiting.
- Any frontend work — AB-1010.

## Decisions

### 1. Case-insensitive email via normalization, not a DB extension
**Decision:** Normalize email to lowercase in the service layer before every write and read
(registration uniqueness check, login lookup), and store the normalized form. `User.email`
stays a plain `@unique` string column.
**Alternative considered:** PostgreSQL `citext` extension for true case-insensitive collation.
Rejected — adds a DB extension dependency for no real benefit over app-level normalization,
which is simpler and sufficient since we always control the write path.

### 2. Refresh token rotation + reuse detection (confirms existing SDS design)
**Decision:** Each `RefreshToken` row is single-use. On `/auth/refresh`, the presented token is
looked up by `tokenHash` (SHA-256 of the raw token), checked for `revokedAt IS NULL` and
`expiresAt > now()`, then immediately marked `revokedAt = now()` and a new row inserted — both
in one `prisma.$transaction`. If the presented token's hash matches a row that already has
`revokedAt` set, treat as reuse: revoke every `RefreshToken` row for that `userId`.
**Alternative considered:** Token families (a `familyId` shared across a rotation chain, revoking
only that family on reuse rather than all of a user's sessions). Rejected for this ticket — more
complex, and FRS doesn't require preserving other-device sessions after a suspected compromise;
revoking everything is the safer default. Can revisit as a follow-up if needed.

### 3. Logout requires both access token and refresh token
**Decision:** `POST /auth/logout` is behind `requireAuth` (validates the access token, sets
`req.userId`) AND requires `{ refreshToken }` in the body. The service verifies the refresh
token's owning `userId` matches `req.userId` before revoking it — prevents one user from logging
out another user's session even if they somehow obtained a refresh token string.
**Alternative considered:** Refresh token alone as proof (no `requireAuth`). Rejected per the
`/spec` decision — requiring both is a stronger, cheap-to-implement guarantee.

### 4. Rate limiting via `express-rate-limit`, in-memory store
**Decision:** Use `express-rate-limit@8.5.2` (pinned) with its default in-memory store. Login:
5 attempts / 15 minutes, keyed by IP. Registration: 5 attempts / 15 minutes, keyed by IP. These
thresholds are not specified anywhere in FRS or the clarifying-question answers — they're a
reasonable default I'm choosing now. **Flagged as an open question below** — confirm or adjust
before `/tasks`.
**Alternative considered:** Keying login rate limiting by email instead of IP. Rejected as the
sole key — an attacker could still hammer many emails from one IP; IP-keying is the more direct
brute-force mitigation. (Could layer email-keying on top later if needed; not required by any
current spec scenario.)

### 5. Password complexity errors as a Zod `superRefine`
**Decision:** A single Zod schema field for `password` uses `.superRefine` to push one issue per
violated sub-rule (length, letter, number), rather than `.min()`/`.regex()` chained checks that
short-circuit on the first failure. This is required to satisfy the spec scenario "Weak password
lists every violated rule."

## File Paths to Create

- `backend/prisma/schema.prisma` — **modify**: add `User`, `RefreshToken` models
- `packages/shared/src/auth.ts` — **new**: Zod schemas (`registerSchema`, `loginSchema`,
  `logoutSchema`, `refreshSchema`) + inferred types
- `packages/shared/src/index.ts` — **modify**: export `auth.ts`
- `backend/src/lib/prisma.ts` — **new**: Prisma client singleton
- `backend/src/lib/jwt.ts` — **new**: `signAccessToken`, `verifyAccessToken`
- `backend/src/lib/hash.ts` — **new**: `hashPassword`/`comparePassword` (bcrypt),
  `hashToken`/generate raw refresh token (SHA-256 + crypto.randomBytes)
- `backend/src/middleware/requireAuth.ts` — **new**
- `backend/src/middleware/rateLimit.ts` — **new**: `loginLimiter`, `registerLimiter`
- `backend/src/services/AuthService.ts` — **new**: `register`, `login`, `logout`, `refresh`
- `backend/src/routes/auth.ts` — **new**: wires the four endpoints
- `backend/src/index.ts` — **modify**: mount `express.json()`, `cors`, and `/api/auth` router
- `backend/tests/auth.test.ts` — **new**: one test per spec scenario (Supertest, real test DB)

## TypeScript Interfaces / Zod Schemas (packages/shared/src/auth.ts)

```typescript
export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema, // superRefine, see Decision 5
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

// Response shapes (match docs/SDS.md Section 5 exactly)
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
```

## DB Changes

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  expiresAt DateTime
  createdAt DateTime  @default(now())
  revokedAt DateTime?

  @@index([userId])
}
```

Backward compatible: yes — purely additive, first migration in the project, no existing data.
Migration: `npx prisma migrate dev --schema backend/prisma/schema.prisma --name add_user_and_refresh_token`.

## Reuse of Existing Shared Code

None yet exists to reuse (`packages/shared/src/index.ts` is currently an empty barrel) — this
ticket is what populates it for the first time. Every future ticket that touches auth (AB-1003,
AB-1010) must import from `packages/shared/src/auth.ts` rather than redefining these shapes.

## Risks / Trade-offs

- **[Risk] Context7 MCP is not active in this session** (flagged at `/start`) → every
  library/API usage here (`express-rate-limit`, `jsonwebtoken`, `bcrypt`, `zod` `superRefine`)
  is based on established knowledge, not live-doc verification as CLAUDE.md's Library
  Verification rule requires. **Mitigation:** flagging explicitly here rather than silently
  proceeding; recommend a human spot-check of the `express-rate-limit` and Zod `superRefine`
  API usage during `/implement` once code exists, or activating Context7 before implementation
  starts.
- **[Risk] In-memory rate limit store resets on server restart / doesn't share state across
  instances** → acceptable for this project's single-instance scope (Non-Goals), but would not
  hold up in a horizontally-scaled deployment. Mitigation: none needed now; documented as a
  known limitation.
- **[Risk] Revoking all refresh tokens on reuse detection logs out every device**, which could
  surprise a legitimate user who reused a token due to a client-side bug (not just an attacker)
  → mitigation: this matches the documented SDS design and FRS's safety-first stance elsewhere
  (e.g. password reset also revokes all tokens); accepted trade-off, not something to soften
  without a spec change.

## Migration Plan

1. Write the Prisma schema changes.
2. Run `prisma migrate dev` locally to generate and apply the migration, and regenerate the
   Prisma client.
3. No rollback complexity — first migration, nothing to preserve.

## Open Questions

1. **Rate limit thresholds** (5 attempts / 15 min, IP-keyed) are my default, not specified in
   FRS or prior answers — confirm or adjust before `/tasks`.
2. **Access token payload** — design assumes `{ sub: userId }` only, per `docs/SDS.md` Section 4.
   Confirming no additional claims (e.g. email) are needed in the token itself.
