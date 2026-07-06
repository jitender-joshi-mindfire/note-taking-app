## Why

FRS 3.1–3.4 (registration, login, logout, forgot/reset password) are fully implemented on the
backend (AB-1002, AB-1003) but have no user-facing surface yet. This ticket builds the frontend
pages that let a user actually register, log in, log out, and recover a forgotten password.

## What Changes

- **Registration page** (`/register`, FRS 3.1): form validated with `packages/shared`'s
  `registerSchema`; on success, persists `{ user, accessToken, refreshToken }` to `localStorage`
  and navigates to `/notes`; surfaces field-level errors (weak password, invalid email) and the
  generic duplicate-email error from the backend.
- **Login page** (`/login`, FRS 3.2): form validated with `loginSchema`; on success, same
  persist-and-navigate behavior as registration; on failure, shows one generic "invalid email or
  password" message — never field-level, matching the backend's anti-enumeration design.
- **Logout** (FRS 3.3): a logout action (on the placeholder `/notes` page, see below) calls
  `POST /api/auth/logout` with the stored refresh token, clears `localStorage`, and navigates to
  `/login`.
- **Forgot password page** (`/forgot-password`, FRS 3.4): email-only form; always shows the same
  generic "if that email exists, a code was sent" confirmation regardless of whether the account
  exists, matching the backend's no-enumeration guarantee (FRS 3.4.1). Since no real email is
  sent (FRS 3.4.2, assignment-wide constraint), the confirmation screen also notes the OTP is
  logged to the server console — this is a development-mode affordance, not a production pattern.
- **Reset password page** (`/reset-password`): email + OTP + new-password form; surfaces the
  backend's specific error states (expired OTP → 410, wrong/used OTP → 401, weak new password →
  400 field errors) distinctly, since the backend already distinguishes them.
- **Route protection**: an unauthenticated user visiting `/notes` is redirected to `/login`; an
  authenticated user visiting `/login`, `/register`, `/forgot-password`, or `/reset-password` is
  redirected to `/notes`. Implemented as a route-guard wrapper, not per-page checks.
- **Placeholder `/notes` route**: a minimal authenticated page (shows the logged-in user's email
  — read from the `user` object persisted at login/register time, no new backend call — and a
  logout button) that exists purely as the login/registration redirect target and to prove the
  guard works end-to-end. AB-1011 replaces its contents with the real notes list; the route and
  guard logic don't change.
- **New dependency**: React Router (decided during `/spec` — no routing library exists in
  `frontend/package.json` yet).
- **Token storage**: both tokens persisted to `localStorage` (decided during `/spec` — the
  backend returns tokens in the JSON response body, not httpOnly cookies, so this is the
  standard pattern for this architecture; `frontend/CLAUDE.md`'s reference to "SDS Section 4"
  for token-storage guidance turned out to point at backend-only content with no frontend
  guidance — flagging this as a real gap resolved by this ticket's decision, not silently
  invented).
- **Out of scope for this ticket** (decided during `/spec`): the shared authenticated API client
  (attaching the access token to protected requests, silently refreshing on a 401) — nothing in
  this ticket's own pages calls a protected endpoint; that client is needed starting at AB-1011
  and will be built there.

## Capabilities

### New Capabilities
- `frontend-auth`: registration, login, logout, forgot/reset password pages and route
  protection, per FRS 3.1–3.4. Distinct from the existing `user-auth` capability, which is the
  backend API behavior these pages consume — `user-auth`'s requirements are unchanged.

### Modified Capabilities
(none)

## Impact

- **New frontend code**: `frontend/src/pages/RegisterPage.tsx`, `LoginPage.tsx`,
  `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `NotesPlaceholderPage.tsx`;
  `frontend/src/lib/authStorage.ts` (localStorage read/write helpers);
  `frontend/src/components/RequireAuth.tsx` (route guard); `frontend/src/App.tsx` rewritten to
  define routes via React Router.
- **New dependency**: `react-router` (or `react-router-dom`, exact package name confirmed at
  `/plan`), added to `frontend/package.json` with a pinned version (per this project's
  no-`@latest` rule).
- **No backend changes** — this ticket only consumes existing `/api/auth/*` endpoints.
- **No changes to `packages/shared`** — reuses the existing `registerSchema`, `loginSchema`,
  `forgotPasswordSchema`, `resetPasswordSchema` from `packages/shared/src/auth.ts` as-is.
- **No changes to `docs/SDS.md`** — no new API contract or DB schema involved.
