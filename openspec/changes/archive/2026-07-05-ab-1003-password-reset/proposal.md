## Why

Users who forget their password currently have no way to regain access to their account —
AB-1002 only covers registration, login, and logout. This closes that gap with an OTP-based
reset flow, without requiring real email delivery (out of scope per docs/FRS.md 2.2).

## What Changes

- Add `POST /auth/forgot-password` — request a one-time reset code for an email, always
  returning the same success response regardless of whether the account exists (FRS 3.4.1).
- Add `POST /auth/reset-password` — consume a valid OTP to set a new password (FRS 3.4.2–3.4.6).
- Requesting a new OTP invalidates any previously-issued, unused OTP for that account (FRS
  3.4.6, added during this ticket's clarification).
- On successful reset, all of the user's refresh tokens are revoked, forcing re-login on every
  device (FRS 3.4.5) — the reset response itself does not issue new tokens.
- Extend rate limiting (FRS 3.5.3, 3.5.4, added during this ticket's clarification) to both new
  endpoints, matching the existing login/registration pattern from AB-1002.
- Forgot-password's response timing must not leak whether an account exists, extending the
  anti-enumeration lesson learned from AB-1002's login timing side-channel finding.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `user-auth`: adding password-reset-request and password-reset-confirmation requirements.
  These are new requirements (ADDED, not edits to registration/login/logout/rotation/rate-limit
  requirements already in `openspec/specs/user-auth/spec.md`), grouped under the same capability
  since they're part of the same auth domain.

## Impact

- **New DB table** (docs/SDS.md Section 3): `PasswordResetOtp`.
- **New backend code**: two new routes in `backend/src/routes/auth.ts`, new service functions in
  `backend/src/services/AuthService.ts`, a new `backend/src/lib/otp.ts` helper, two new rate
  limiters in `backend/src/middleware/rateLimit.ts`.
- **New shared code**: Zod schemas for forgot-password/reset-password request bodies in
  `packages/shared/src/auth.ts`.
- **No breaking changes** — net-new endpoints, nothing existing depends on them.
