## 1. Foundation

- [x] 1.1 Add `PasswordResetOtp` model and `User.resetOtps` relation to
      `backend/prisma/schema.prisma`
- [x] 1.2 Run `prisma migrate dev` to create and apply the migration, regenerate the Prisma
      client; apply the same migration to the test database
- [x] 1.3 Export `passwordSchema` from `packages/shared/src/auth.ts` (currently private) and add
      `forgotPasswordSchema`, `resetPasswordSchema`
- [x] 1.4 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1003 is backend-only (no frontend component; that's part of AB-1010).

- [x] 2.1 Add `backend/src/lib/otp.ts`: `generateOtp()` — 6-digit numeric string via
      `crypto.randomInt`, zero-padded; verified empirically (`randomInt` does NOT auto-pad,
      `.padStart(6, "0")` is required)
- [x] 2.2 Add `forgotPasswordLimiter`, `resetPasswordLimiter` to
      `backend/src/middleware/rateLimit.ts`
- [x] 2.3 Add `InvalidOtpError`, `ExpiredOtpError` to `backend/src/services/AuthService.ts`
- [x] 2.4 `AuthService.requestPasswordReset(email)`: look up user (case-insensitive), if found
      delete existing `PasswordResetOtp` rows for that user and create a new one in one
      `$transaction`, log the OTP to console; apply the response-time floor (Decision 2) on
      both the found and not-found paths
- [x] 2.5 `AuthService.confirmPasswordReset(email, otp, newPassword)`: validate OTP first
      (expired → `ExpiredOtpError`, wrong/used → `InvalidOtpError`), then validate password
      complexity, then update password hash, mark OTP used, revoke all refresh tokens for
      that user
- [x] 2.6 Add `POST /forgot-password`, `POST /reset-password` to `backend/src/routes/auth.ts`
      with correct middleware order (rate limiter → Zod validation → service call) and status
      code mapping (410 expired, 401 wrong/used, 400 weak password)
- [x] 2.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green. Also manually smoke-tested both endpoints against a real Postgres instance
      (forgot-password for existing/nonexistent accounts with timing check, OTP invalidation on
      re-request, successful reset, old-password-dead, OTP single-use, wrong OTP, rate limiting)
      — all behaved correctly.

## 3. Tests (one per spec scenario)

- [x] 3.1 Test: Request reset for an existing account
- [x] 3.2 Test: Request reset for a non-existent account returns an identical response
- [x] 3.3 Test: New OTP request invalidates the previous one
- [x] 3.4 Test: Successful password reset
- [x] 3.5 Test: Expired OTP rejected
- [x] 3.6 Test: Wrong or already-used OTP rejected
- [x] 3.7 Test: Weak new password rejected
- [x] 3.8 Test: Excessive forgot-password requests rejected
- [x] 3.9 Test: Excessive reset-password attempts rejected
- [x] 3.10 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code (achieved 89.58%
      statements/lines, 93.1% functions)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1003-password-reset`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1003 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
