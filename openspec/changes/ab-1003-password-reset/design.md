## Context

AB-1002 established the auth foundation (User, RefreshToken, requireAuth, rate limiting
pattern, AuthService). This ticket adds the `PasswordResetOtp` model already anticipated in
docs/SDS.md Section 3, and two new endpoints. No existing auth code needs to change beyond
adding new rate limiters and service functions — this is purely additive to `user-auth`.

## Goals / Non-Goals

**Goals:**
- Implement forgot-password/reset-password exactly per the spec delta (11 scenarios).
- Close the same class of timing side-channel AB-1002's login review caught, but adapted to
  this endpoint's actual cost profile (SHA-256 OTP hashing, not bcrypt — see Decision 2).

**Non-Goals:**
- Real email delivery (out of scope project-wide, FRS 2.2) — OTP is logged to console.
- Auto-login after reset (per `/spec` clarification — reset only confirms success).

## Decisions

### 1. New OTP invalidates prior ones via delete-then-create, not a status flag
**Decision:** When a new OTP is requested for a user, delete all of that user's existing
`PasswordResetOtp` rows, then create the new one — both in one `prisma.$transaction`. A "valid
OTP" is simply "the most recent row for this user, unexpired, `usedAt IS NULL`."
**Alternative considered:** Add an `invalidated` boolean/reason field instead of deleting (mirrors
AB-1002's `rotatedToId` pattern). Rejected — unlike refresh tokens, there's no scenario here that
needs to distinguish *why* an old OTP stopped being valid (AB-1002 needed that distinction to
avoid over-broad session revocation; nothing analogous applies to abandoned OTPs). Deleting is
simpler and sufficient.

### 2. Timing-safety via a minimum response-time floor, not a dummy bcrypt comparison
**Decision:** `docs/SDS.md` specifies OTP hashing via SHA-256 (fast — microseconds), not bcrypt
like passwords. AB-1002's fix (compare against a dummy bcrypt hash to equalize cost) doesn't
apply here since there's no slow hash in the loop to equalize. Instead, `requestPasswordReset`
measures elapsed time and, before returning, sleeps any remaining time up to a fixed floor
(e.g. 50ms) — applied on both the found and not-found paths identically, so total handler
duration is constant regardless of branch taken.
**Alternative considered:** Perform a dummy `PasswordResetOtp` delete+create on the not-found
path to match the found path's DB cost. Rejected — `PasswordResetOtp.userId` has a foreign key
to `User.id`; there is no valid dummy user id to write against without violating referential
integrity or creating a real fake user row (worse). A time floor sidesteps this entirely.

### 3. OTP validity check happens before password complexity check
**Decision:** `confirmPasswordReset` validates the OTP (expired → 410, wrong/used → 401) before
validating the new password's complexity (400). Rejected: not authorized to change the password
at all (bad OTP) should short-circuit before spending effort validating what they'd change it to.
**Alternative considered:** Validate password shape first (cheap, no DB hit) via Zod at the route
layer regardless of OTP state — this still happens (Zod schema validation is always first,
catching malformed requests), but the *business-rule* complexity check inside the service after
DB-verifying the OTP is what's being sequenced here.

### 4. Separate rate limiters per endpoint, matching AB-1002's pattern
**Decision:** Two new `rateLimit()` instances — `forgotPasswordLimiter`, `resetPasswordLimiter`
— same 5/15min IP-keyed config as `loginLimiter`/`registerLimiter`. Not shared counters.
**Alternative considered:** Reuse `loginLimiter` for `reset-password` since both are
credential-adjacent. Rejected — conflating them would let exhausting one lock out the other
unnecessarily; separate limiters match the existing per-endpoint convention.

## File Paths to Create

- `backend/prisma/schema.prisma` — **modify**: add `PasswordResetOtp` model
- `backend/src/lib/otp.ts` — **new**: `generateOtp()` (6-digit numeric string via
  `crypto.randomInt`), reuses `hashToken` from `lib/hash.ts` for hashing (SHA-256, matching SDS)
- `backend/src/middleware/rateLimit.ts` — **modify**: add `forgotPasswordLimiter`,
  `resetPasswordLimiter`
- `backend/src/services/AuthService.ts` — **modify**: add `requestPasswordReset(email)`,
  `confirmPasswordReset(email, otp, newPassword)`
- `backend/src/routes/auth.ts` — **modify**: add `POST /forgot-password`, `POST /reset-password`
- `packages/shared/src/auth.ts` — **modify**: add `forgotPasswordSchema`, `resetPasswordSchema`
  (reusing the existing `passwordSchema` for the new-password field)
- `backend/tests/auth.test.ts` — **modify**: add 11 tests, one per spec scenario

## TypeScript Interfaces / Zod Schemas (packages/shared/src/auth.ts additions)

```typescript
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: passwordSchema, // reuses the existing superRefine password rule
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

`passwordSchema` is currently a private (non-exported) const in `auth.ts` — this ticket exports
it so `resetPasswordSchema` can reuse it, per `packages/shared/CLAUDE.md`'s "never duplicate"
rule.

## DB Changes

```prisma
model PasswordResetOtp {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  otpHash   String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

Matches `docs/SDS.md` Section 3 exactly (already anticipated there). Backward compatible —
purely additive, new table, no existing data affected. Also requires adding
`resetOtps PasswordResetOtp[]` to `User` (already present in SDS's `User` model, not yet added
to the actual `schema.prisma` since AB-1002 didn't need it).

## Reuse of Existing Shared Code

- `hashToken` (SHA-256) from `backend/src/lib/hash.ts` — reused for OTP hashing, not duplicated.
- `passwordSchema` from `packages/shared/src/auth.ts` — reused for the new-password field.
- Rate limiter pattern from `backend/src/middleware/rateLimit.ts` — same shape, two new instances.
- Error-class-per-failure-mode pattern from `AuthService.ts` (`DuplicateEmailError`, etc.) —
  extended with `InvalidOtpError`, `ExpiredOtpError`.

## Risks / Trade-offs

- **[Risk] Fixed time-floor (Decision 2) adds latency to every forgot-password request**, even
  fast ones → Mitigation: floor is small (50ms) relative to network latency; acceptable trade-off
  for closing the enumeration side-channel, consistent with the priority AB-1002's review placed
  on this exact class of issue.
- **[Risk] Deleting prior OTPs (Decision 1) means a user who lost the email/log containing their
  first OTP and requests a second loses any chance of using the first one** → Mitigation: this is
  the intended behavior per FRS 3.4.6 and the `/spec` clarification; not a bug.
- **[Risk] `crypto.randomInt` for 6-digit OTP generation** — verify this produces a
  uniformly-distributed, correctly-zero-padded 6-digit string (e.g. "004821", not "4821") during
  `/implement`, since Context7 MCP is not active this session to verify live docs.

## Migration Plan

1. Add `PasswordResetOtp` model + `User.resetOtps` relation to schema.
2. Run `prisma migrate dev`, apply to both dev and test databases, regenerate client.
3. No rollback complexity — additive migration, no existing data touched.

## Open Questions

None outstanding — all clarifying questions from `/spec` were resolved with recommended
defaults before this design was written.
