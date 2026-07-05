# user-auth Specification

## Purpose
TBD - created by archiving change ab-1002-user-auth. Update Purpose after archive.
## Requirements
### Requirement: User Registration
The system SHALL allow a new user to register with an email and password. The email MUST be
unique (case-insensitive) and a valid format. The password MUST be at least 8 characters and
contain at least one letter and one number. On success, the password SHALL be hashed and never
stored or returned in plaintext, and the user SHALL be logged in immediately (an access token
and a refresh token issued).

#### Scenario: Successful registration
- **WHEN** a client submits a unique, valid email and a password meeting the complexity rule
- **THEN** the system creates the user, hashes the password, and returns 201 with the user (no
  password hash), an access token, and a refresh token

#### Scenario: Duplicate email rejected
- **WHEN** a client submits an email that is already registered (case-insensitive match)
- **THEN** the system rejects with 422 and a generic "email already registered" message

#### Scenario: Invalid email format rejected
- **WHEN** a client submits a malformed email address
- **THEN** the system rejects with 400 and a field-level error for `email`

#### Scenario: Weak password lists every violated rule
- **WHEN** a client submits a password that is both too short and missing a number
- **THEN** the system rejects with 400 and a field-level error listing all violated sub-rules
  (not just the first one found)

### Requirement: User Login
The system SHALL allow a registered user to authenticate with email and password
(case-insensitive email match). On success it SHALL issue a short-lived JWT access token and a
long-lived refresh token persisted server-side. On failure it SHALL return the same generic
error regardless of whether the email or the password was wrong.

#### Scenario: Successful login issues tokens
- **WHEN** a client submits the correct email (any case) and password for a registered user
- **THEN** the system returns 200 with the user, a JWT access token, and a refresh token, and
  persists the refresh token server-side

#### Scenario: Wrong credentials return a generic error
- **WHEN** a client submits a non-existent email, or a registered email with the wrong password
- **THEN** the system rejects with 401 and the same generic "invalid email or password" message
  in both cases

#### Scenario: Missing fields rejected
- **WHEN** a client submits a login request missing `email` or `password`
- **THEN** the system rejects with 400 and a validation error

### Requirement: User Logout
The system SHALL allow an authenticated user to log out, which revokes the presented refresh
token server-side. The request MUST include a valid, unexpired access token (`requireAuth`) in
addition to the refresh token to revoke — presenting only one of the two is insufficient. After
logout, the revoked refresh token MUST NOT be usable to obtain a new access token.

#### Scenario: Logout revokes the refresh token
- **WHEN** an authenticated client (valid access token) calls logout with their own valid
  refresh token
- **THEN** the system revokes that refresh token server-side and returns 204

#### Scenario: Revoked refresh token cannot be reused
- **WHEN** a client attempts to use a refresh token that was already revoked via logout
- **THEN** the system rejects the refresh attempt with 401

#### Scenario: Logout without a valid access token is rejected
- **WHEN** a client calls logout with a missing, invalid, or expired access token, even if the
  refresh token in the body is valid
- **THEN** the system rejects with 401 and does not revoke the refresh token

#### Scenario: Logout with another user's refresh token is rejected
- **WHEN** a client presents a valid access token for User A together with a refresh token that
  belongs to User B
- **THEN** the system rejects with 401 and does not revoke User B's refresh token

### Requirement: Refresh Token Rotation and Reuse Detection
The system SHALL rotate the refresh token on every successful use: the presented token is
revoked and a new refresh token is issued in the same response. If a refresh token that has
already been rotated (i.e., already used once) is presented again, the system SHALL treat this
as a compromise signal and revoke all of that user's active refresh tokens.

#### Scenario: Refreshing rotates the token
- **WHEN** a client presents a valid, not-yet-used refresh token to the refresh endpoint
- **THEN** the system issues a new access token and a new refresh token, and the presented
  refresh token becomes invalid for future use

#### Scenario: Reusing a rotated refresh token revokes all sessions
- **WHEN** a client presents a refresh token that has already been rotated (used once before)
- **THEN** the system rejects the request with 401 and revokes every refresh token currently
  active for that user

### Requirement: Login and Registration Rate Limiting
The system SHALL rate-limit login and registration attempts per identifier within a rolling
window to reduce brute-force and automated account-creation risk. Exceeding the limit SHALL
reject further attempts until the window resets, without revealing whether any underlying
credential was correct.

#### Scenario: Excessive login attempts rejected
- **WHEN** a client exceeds the allowed number of login attempts for an identifier (IP and/or
  email) within the rolling window
- **THEN** the system rejects further login attempts for that identifier with a 429 response
  until the window resets

#### Scenario: Excessive registration attempts rejected
- **WHEN** a client exceeds the allowed number of registration attempts from a single IP within
  the rolling window
- **THEN** the system rejects further registration attempts from that IP with a 429 response
  until the window resets

