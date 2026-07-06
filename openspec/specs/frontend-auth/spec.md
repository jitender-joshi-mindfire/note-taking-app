# frontend-auth Specification

## Purpose
TBD - created by archiving change ab-1010-frontend-auth. Update Purpose after archive.
## Requirements
### Requirement: Registration Page
The system SHALL present a registration form (email, password) at `/register`, validated
client-side using `packages/shared`'s `registerSchema` before submission. On successful
registration, the system SHALL persist the returned user, access token, and refresh token, and
navigate to `/notes`. On a duplicate-email response, the system SHALL display the backend's
generic "email already registered" message. On a validation failure, the system SHALL display
field-level errors matching the violated rule(s).

#### Scenario: Successful registration navigates to the notes page
- **WHEN** a user submits a unique, valid email and a password meeting the complexity rule
- **THEN** the system persists the returned session and navigates to `/notes`

#### Scenario: Duplicate email shows the generic backend error
- **WHEN** a user submits an email that the backend reports as already registered
- **THEN** the system displays the generic "email already registered" message, without
  navigating away from `/register`

#### Scenario: Weak password shows field-level errors
- **WHEN** a user submits a password that fails the complexity rule
- **THEN** the system displays a field-level error for the password field before (or instead of)
  submitting, listing the violated rule(s)

### Requirement: Login Page
The system SHALL present a login form (email, password) at `/login`, validated client-side using
`loginSchema`. On successful login, the system SHALL persist the returned session and navigate
to `/notes`, identically to registration. On invalid credentials, the system SHALL display one
generic error — never a field-level distinction between "wrong email" and "wrong password" —
matching the backend's anti-enumeration design.

#### Scenario: Successful login navigates to the notes page
- **WHEN** a user submits credentials matching an existing account
- **THEN** the system persists the returned session and navigates to `/notes`

#### Scenario: Invalid credentials show one generic error
- **WHEN** a user submits an email or password that doesn't match any account
- **THEN** the system displays a single generic "invalid email or password" message, with no
  indication of which field was wrong

### Requirement: Logout
The system SHALL allow an authenticated user to log out. Logging out SHALL call the backend's
logout endpoint with the stored refresh token, clear all persisted session data, and navigate to
`/login`.

#### Scenario: Logging out clears the session and navigates to login
- **WHEN** an authenticated user triggers logout
- **THEN** the system clears the persisted session and navigates to `/login`

### Requirement: Forgot Password Request
The system SHALL present an email-only form at `/forgot-password`, validated with
`forgotPasswordSchema`. Regardless of whether the submitted email corresponds to an existing
account, the system SHALL display the same generic confirmation message, matching the backend's
no-enumeration guarantee (FRS 3.4.1). Since no real email is sent (FRS 3.4.2), the confirmation
SHALL also note that the code is available in the server console — a development-mode
affordance only.

#### Scenario: Submitting any email shows the same generic confirmation
- **WHEN** a user submits an email address, whether or not it corresponds to an existing account
- **THEN** the system displays the same generic confirmation message in both cases

### Requirement: Password Reset
The system SHALL present a form at `/reset-password` accepting email, OTP, and a new password,
validated with `resetPasswordSchema`. Because a successful reset revokes all of the user's
existing sessions (FRS 3.4.5), the system SHALL NOT persist a new session or navigate to
`/notes` on success — it SHALL navigate to `/login` instead. The backend's distinct error states
SHALL be surfaced distinctly: an expired OTP, an invalid/already-used OTP, and a new password
failing the complexity rule SHALL each display their own specific message.

#### Scenario: Successful reset navigates to login, not notes
- **WHEN** a user submits a valid, unexpired OTP and a new password meeting the complexity rule
- **THEN** the system shows a success indication and navigates to `/login`, without persisting
  any session

#### Scenario: Expired OTP shows a distinct message
- **WHEN** a user submits an OTP that has expired
- **THEN** the system displays a message distinct from the invalid-OTP and weak-password cases

#### Scenario: Invalid or already-used OTP shows a distinct message
- **WHEN** a user submits an OTP that is wrong or has already been consumed
- **THEN** the system displays a message distinct from the expired-OTP and weak-password cases

#### Scenario: Weak new password shows field-level errors
- **WHEN** a user submits a new password that fails the complexity rule (with a valid,
  unexpired OTP)
- **THEN** the system displays a field-level error for the new password field

### Requirement: Route Protection
The system SHALL redirect an unauthenticated visitor away from the protected `/notes` route to
`/login`. The system SHALL redirect an already-authenticated visitor away from any of `/login`,
`/register`, `/forgot-password`, or `/reset-password` to `/notes`. A minimal placeholder page
SHALL exist at `/notes` (showing the logged-in user's email and a logout action) purely to serve
as this redirect target and prove the guard behaves correctly end-to-end.

#### Scenario: Unauthenticated visit to the notes page redirects to login
- **WHEN** a visitor with no persisted session navigates to `/notes`
- **THEN** the system redirects them to `/login`

#### Scenario: Authenticated visit to an auth page redirects to notes
- **WHEN** a visitor with a persisted session navigates to `/login` or `/register`
- **THEN** the system redirects them to `/notes`

