## 1. Foundation

- [x] 1.1 Add `User` and `RefreshToken` models to `backend/prisma/schema.prisma`
- [x] 1.2 Run `prisma migrate dev` to create and apply the migration, regenerate the Prisma client
- [x] 1.3 Add `packages/shared/src/auth.ts`: `registerSchema` (with `superRefine` password check),
      `loginSchema`, `logoutSchema`, `refreshSchema`, `AuthUser`/`AuthTokens` types
- [x] 1.4 Export `auth.ts` from `packages/shared/src/index.ts`
- [x] 1.5 Add `express-rate-limit@8.5.2` to `backend/package.json` (pinned)
- [x] 1.6 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 2. Core Implementation

No `[PARALLEL]` tasks in this ticket — AB-1002 is backend-only (no frontend component; that's
AB-1010), so there's no independent domain to split across worktrees.

- [x] 2.1 Add `backend/src/lib/prisma.ts` (Prisma client singleton) — done in Phase 1, needed
      early to verify the migration
- [x] 2.2 Add `backend/src/lib/hash.ts`: `hashPassword`/`comparePassword` (bcrypt),
      `generateRefreshToken`/`hashToken` (crypto)
- [x] 2.3 Add `backend/src/lib/jwt.ts`: `signAccessToken`/`verifyAccessToken`
- [x] 2.4 Add `backend/src/middleware/requireAuth.ts`
- [x] 2.5 Add `backend/src/middleware/rateLimit.ts`: `loginLimiter`, `registerLimiter`
      (5 attempts / 15 min, IP-keyed)
- [x] 2.6 Add `backend/src/services/AuthService.ts` — `register`: normalize email to lowercase,
      check uniqueness, hash password, create user + first refresh token
- [x] 2.7 `AuthService.login`: case-insensitive email lookup, compare password, issue
      access + refresh tokens
- [x] 2.8 `AuthService.logout`: verify the refresh token belongs to `req.userId`, revoke it
- [x] 2.9 `AuthService.refresh`: rotation + reuse-detection transaction (Decision 2 in `design.md`)
- [x] 2.10 Add `backend/src/routes/auth.ts`: wire all 4 endpoints with correct middleware order
      (rate limiter → Zod validation → `requireAuth` where applicable → service call)
- [x] 2.11 Add `backend/src/app.ts` (Express app + middleware + routes, separated from
      `index.ts`'s `app.listen()` so tests can import the app directly — not in the original
      task list, needed for Phase 3 Supertest tests to work without binding a real port) and
      wire `express.json()`, `cors`, and the `/api/auth` router into it
- [x] 2.12 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green.
      Also manually smoke-tested all 4 endpoints against a real Postgres instance (register,
      duplicate/weak-password rejection, case-insensitive login, generic credential errors,
      requireAuth-gated logout, refresh rotation, reuse detection + mass revocation, rate
      limiting) — all behaved correctly.

## 3. Tests (one per spec scenario)

- [x] 3.1 Test: Successful registration
- [x] 3.2 Test: Duplicate email rejected
- [x] 3.3 Test: Invalid email format rejected
- [x] 3.4 Test: Weak password lists every violated rule
- [x] 3.5 Test: Successful login issues tokens
- [x] 3.6 Test: Wrong credentials return a generic error
- [x] 3.7 Test: Missing fields rejected
- [x] 3.8 Test: Logout revokes the refresh token
- [x] 3.9 Test: Revoked refresh token cannot be reused
- [x] 3.10 Test: Logout without a valid access token is rejected
- [x] 3.11 Test: Refreshing rotates the token
- [x] 3.12 Test: Reusing a rotated refresh token revokes all sessions
- [x] 3.13 Test: Excessive login attempts rejected
- [x] 3.14 Test: Excessive registration attempts rejected
- [x] 3.15 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code (achieved 84.96%
      statements/lines, 90.47% functions)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1002-user-auth`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1002 status to `Done`
