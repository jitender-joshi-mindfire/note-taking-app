# frontend-api-client Specification

## Purpose
TBD - created by archiving change ab-1011-notes-list. Update Purpose after archive.
## Requirements
### Requirement: Bearer Token Attachment
The system SHALL attach `Authorization: Bearer <accessToken>` from the persisted session to every
request made through the authenticated API client.

#### Scenario: A request includes the current access token
- **WHEN** an authenticated request is made through the API client
- **THEN** the request includes an `Authorization` header carrying the current session's access
  token

### Requirement: Silent Refresh on Expired Access Token
The system SHALL, upon receiving a `401` response to an authenticated request, call the backend's
refresh endpoint once with the stored refresh token, and on success persist the new tokens and
retry the original request exactly once with the new access token.

#### Scenario: Expired access token triggers a silent refresh and retry
- **WHEN** an authenticated request receives a `401` response
- **THEN** the system requests new tokens via the refresh endpoint, persists them, and retries the
  original request once with the new access token

#### Scenario: The retried request's response is returned to the caller
- **WHEN** the retried request succeeds after a successful silent refresh
- **THEN** the caller receives that successful response as if the original request had succeeded
  directly, with no indication a refresh occurred

### Requirement: Refresh Failure Ends the Session
The system SHALL, if the refresh endpoint call itself fails, clear the persisted session and
navigate to `/login`, without retrying the original request.

#### Scenario: Refresh failure clears the session and redirects to login
- **WHEN** the refresh endpoint call fails
- **THEN** the system clears the persisted session and navigates to `/login`, and the original
  request is not retried

### Requirement: Refresh Is Attempted At Most Once Per Request
The system SHALL NOT attempt a second silent refresh for the same original request — if the
retried request also receives a `401`, the system SHALL treat it as a refresh failure (clear
session, navigate to `/login`) rather than attempting another refresh.

#### Scenario: A second 401 after a successful refresh is treated as a final failure
- **WHEN** the retried request also receives a `401` after a successful silent refresh
- **THEN** the system clears the persisted session and navigates to `/login`, without attempting
  another refresh

