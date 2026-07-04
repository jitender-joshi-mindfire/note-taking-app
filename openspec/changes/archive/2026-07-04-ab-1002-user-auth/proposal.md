## Why

The app has no way for a user to create an account or authenticate yet. Every other feature
(notes, tags, search, sharing, version history) is scoped per-user, so authentication is the
foundational capability everything else depends on. This is the first feature ticket after
project setup (AB-1001).

## What Changes

- Add user registration with email + password (FRS 3.1).
- Add login issuing a short-lived JWT access token and a long-lived, DB-persisted refresh token
  (FRS 3.2).
- Add logout that revokes the caller's refresh token, requiring both a valid access token
  (`requireAuth`) and the refresh token to be presented together (FRS 3.3).
- Add refresh-token rotation on every use, with reuse detection: replaying an already-rotated
  token revokes all of that user's refresh tokens (per docs/SDS.md Section 4; hardening beyond
  FRS 3.2.3's minimum).
- Add rate limiting on login and registration attempts to reduce brute-force and enumeration
  risk (FRS 3.5, newly added during this ticket's `/spec` clarification).
- Password validation errors return every violated complexity sub-rule at once, not just the
  first one found (FRS 3.1.2 error scenario).

## Capabilities

### New Capabilities

- `user-auth`: Registration, login, logout, JWT access/refresh token issuance and rotation, and
  login/registration rate limiting.

### Modified Capabilities

(none — `openspec/specs/` is currently empty; this is the first capability added to the system)

## Impact

- **New DB tables** (docs/SDS.md Section 3): `User`, `RefreshToken`.
- **New backend code**: `backend/src/routes/auth.ts`, `backend/src/services/AuthService.ts`,
  `backend/src/middleware/requireAuth.ts`, `backend/src/middleware/rateLimit.ts`.
- **New shared code**: Zod schemas for register/login/logout request bodies in
  `packages/shared/src/auth.ts`.
- **No breaking changes** — this is net-new functionality, nothing existing depends on it yet.
