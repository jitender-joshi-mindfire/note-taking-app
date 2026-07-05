# sharing Specification

## Purpose
TBD - created by archiving change ab-1008-sharing. Update Purpose after archive.
## Requirements
### Requirement: Share Link Generation
The system SHALL allow only a note's owner to generate a public share link for that note,
accepting `expiresInDays` (an integer from 1 to 365). Generating a link for a note that already
has one SHALL replace it entirely — a new token, a new `expiresAt`, and `viewCount` reset to 0 —
and the previous token SHALL immediately become invalid. Generating a link for a note that does
not exist or is not owned by the caller SHALL return not-found.

#### Scenario: Successful link generation for a note with no existing link
- **WHEN** an authenticated owner generates a share link for their own note with a valid
  `expiresInDays`
- **THEN** the system returns 201 with `{ token, url, expiresAt }`

#### Scenario: Generating a link for a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to generate a share link for a note that exists but
  belongs to a different user
- **THEN** the system returns 404

#### Scenario: expiresInDays out of bounds rejected
- **WHEN** an authenticated owner submits `expiresInDays` less than 1 or greater than 365
- **THEN** the system rejects with 400

#### Scenario: Generating a new link replaces the existing one
- **WHEN** an authenticated owner generates a share link for a note that already has an active
  link with a nonzero view count
- **THEN** the system returns a new token distinct from the old one, the new link's view count
  is 0, and the previous token no longer grants public access

### Requirement: Share Link Revocation
The system SHALL allow only a note's owner to revoke that note's active share link at any time,
immediately invalidating it. Revocation is a soft-revoke — the underlying record SHALL be kept
(preserving its final view count), marked with a revocation timestamp, not physically deleted.
Revoking when no active link exists, or revoking a link for a note not owned by the caller,
SHALL return not-found.

#### Scenario: Owner revokes their active share link
- **WHEN** an authenticated owner revokes their note's active share link
- **THEN** the system returns 204 and the link immediately stops granting public access

#### Scenario: Revoking when no active link exists returns not found
- **WHEN** an authenticated owner attempts to revoke a share link for their own note that has no
  active link
- **THEN** the system returns 404

#### Scenario: Revoking a link for a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to revoke a share link for a note that exists but
  belongs to a different user
- **THEN** the system returns 404 and does not revoke that link

### Requirement: Public Access
The system SHALL allow anyone possessing a valid, non-expired, non-revoked share token to view
that note's `title`, `content`, and `updatedAt` read-only, without authentication. An unknown or
revoked token SHALL return not-found (the two cases SHALL be indistinguishable, to avoid
confirming a token ever existed). An expired token SHALL return 410 (gone).

#### Scenario: Valid link returns the note read-only without authentication
- **WHEN** a client requests `GET /share/:token` with a valid, non-expired, non-revoked token
  and no `Authorization` header
- **THEN** the system returns 200 with `{ title, content, updatedAt }`

#### Scenario: Unknown token returns not found
- **WHEN** a client requests `GET /share/:token` with a token that does not correspond to any
  share link
- **THEN** the system returns 404

#### Scenario: Expired token returns gone
- **WHEN** a client requests `GET /share/:token` with a token whose `expiresAt` has passed
- **THEN** the system returns 410

#### Scenario: Revoked token returns not found
- **WHEN** a client requests `GET /share/:token` with a token that has been revoked
- **THEN** the system returns 404, the same response as an unknown token

### Requirement: View Count
Each successful public view of a share link SHALL atomically increment that link's `viewCount`
(no lost updates under concurrent access). An unsuccessful view attempt (unknown, expired, or
revoked token) SHALL NOT increment the count. The owner SHALL be able to see their active link's
current view count via the note's own retrieval endpoints.

#### Scenario: Each successful public view atomically increments the view count
- **WHEN** a share link is viewed successfully multiple times, including concurrently
- **THEN** the final `viewCount` accurately reflects every successful view, with no lost updates

#### Scenario: The owner sees the current view count via the note's response
- **WHEN** an authenticated owner requests their own note that has an active share link with a
  nonzero view count
- **THEN** the note's response includes that view count

#### Scenario: An unsuccessful view attempt does not increment the view count
- **WHEN** a client requests `GET /share/:token` with an expired, revoked, or unknown token
- **THEN** the view count (if the link still exists) is unchanged by that request

