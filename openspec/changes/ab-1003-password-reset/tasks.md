## 1. Foundation

- [ ] 1.1 Add `PasswordResetOtp` model and `User.resetOtps` relation to
      `backend/prisma/schema.prisma`
- [ ] 1.2 Run `prisma migrate dev` to create and apply the migration, regenerate the Prisma
      client; apply the same migration to the test database
- [ ] 1.3 Export `passwordSchema` from `packages/shared/src/auth.ts` (currently private) and add
      `forgotPasswordSchema`, `resetPasswordSchema`
- [ ] 1.4 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1003 is backend-only (no frontend component; that's part of AB-1010).

- [ ] 2.1 Add `backend/src/lib/otp.ts`: `generateOtp()` — 6-digit numeric string via
      `crypto.randomInt`, zero-padded; verify padding behavior empirically (flagged in
      `design.md` as unverified without Context7)
- [ ] 2.2 Add `forgotPasswordLimiter`, `resetPasswordLimiter` to
      `backend/src/middleware/rateLimit.ts`
- [ ] 2.3 Add `InvalidOtpError`, `ExpiredOtpError` to `backend/src/services/AuthService.ts`
- [ ] 2.4 `AuthService.requestPasswordReset(email)`: look up user (case-insensitive), if found
      delete existing `PasswordResetOtp` rows for that user and create a new one in one
      `$transaction`, log the OTP to console; apply the response-time floor (Decision 2) on
      both the found and not-found paths
- [ ] 2.5 `AuthService.confirmPasswordReset(email, otp, newPassword)`: validate OTP first
      (expired → `ExpiredOtpError`, wrong/used → `InvalidOtpError`), then validate password
      complexity, then update password hash, mark OTP used, revoke all refresh tokens for
      that user
- [ ] 2.6 Add `POST /forgot-password`, `POST /reset-password` to `backend/src/routes/auth.ts`
      with correct middleware order (rate limiter → Zod validation → service call) and status
      code mapping (410 expired, 401 wrong/used, 400 weak password)
- [ ] 2.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 3. Tests (one per spec scenario)

- [ ] 3.1 Test: Request reset for an existing account
- [ ] 3.2 Test: Request reset for a non-existent account returns an identical response
- [ ] 3.3 Test: New OTP request invalidates the previous one
- [ ] 3.4 Test: Successful password reset
- [ ] 3.5 Test: Expired OTP rejected
- [ ] 3.6 Test: Wrong or already-used OTP rejected
- [ ] 3.7 Test: Weak new password rejected
- [ ] 3.8 Test: Excessive forgot-password requests rejected
- [ ] 3.9 Test: Excessive reset-password attempts rejected
- [ ] 3.10 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1003-password-reset`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1003 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
