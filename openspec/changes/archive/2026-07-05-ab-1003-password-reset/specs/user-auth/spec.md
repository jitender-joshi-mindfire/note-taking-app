## ADDED Requirements

### Requirement: Password Reset Request
The system SHALL allow anyone to request a password reset OTP for an email address. The
response SHALL be identical (body, status, and timing) whether or not the account exists, so
the endpoint cannot be used to enumerate registered emails. If the account exists, a numeric OTP
SHALL be generated, hashed before storage, and logged to console with the target email (no real
email is sent). Requesting a new OTP SHALL invalidate any previously-issued, unused OTP for that
account.

#### Scenario: Request reset for an existing account
- **WHEN** a client requests a password reset for a registered email
- **THEN** the system returns 200, generates a 6-digit OTP, hashes it before storage, and logs
  it to console with the target email

#### Scenario: Request reset for a non-existent account returns an identical response
- **WHEN** a client requests a password reset for an email that is not registered
- **THEN** the system returns the same 200 response as for a registered email, in
  indistinguishable time, and generates no OTP

#### Scenario: New OTP request invalidates the previous one
- **WHEN** a client requests a password reset for an account that already has a valid, unused
  OTP outstanding
- **THEN** the system invalidates the earlier OTP and only the newly issued OTP is valid

### Requirement: Password Reset Confirmation
The system SHALL allow a user to set a new password by presenting a valid, unexpired, unused OTP
for their email along with a new password meeting the complexity rule (FRS 3.1.2). On success,
every refresh token belonging to that user SHALL be revoked, forcing re-login on all devices. The
reset response SHALL NOT include new access or refresh tokens — the user must log in again
afterward, on every device including the one that performed the reset.

#### Scenario: Successful password reset
- **WHEN** a client presents a valid, unexpired, unused OTP and a password meeting the
  complexity rule for the associated email
- **THEN** the system updates the password hash, marks the OTP used, returns 200 with no auth
  tokens in the response, and revokes every refresh token for that user

#### Scenario: Expired OTP rejected
- **WHEN** a client presents an OTP past its expiry window
- **THEN** the system rejects with 410 and does not change the password

#### Scenario: Wrong or already-used OTP rejected
- **WHEN** a client presents an OTP that does not match the account's current valid OTP, or one
  that has already been consumed
- **THEN** the system rejects with 401 and does not change the password

#### Scenario: Weak new password rejected
- **WHEN** a client presents a valid OTP but a new password that fails the complexity rule
- **THEN** the system rejects with 400 and a field-level error listing every violated sub-rule
  (same behavior as registration, FRS 3.1.2)

### Requirement: Password Reset Rate Limiting
The system SHALL rate-limit both password-reset-request and password-reset-confirmation
attempts per IP within a rolling window, matching the login/registration rate-limiting pattern.

#### Scenario: Excessive forgot-password requests rejected
- **WHEN** a client exceeds the allowed number of forgot-password requests from a single IP
  within the rolling window
- **THEN** the system rejects further requests from that IP with a 429 response until the
  window resets

#### Scenario: Excessive reset-password attempts rejected
- **WHEN** a client exceeds the allowed number of reset-password attempts from a single IP
  within the rolling window
- **THEN** the system rejects further attempts from that IP with a 429 response until the
  window resets
