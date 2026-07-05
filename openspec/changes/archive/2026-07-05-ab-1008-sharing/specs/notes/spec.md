## MODIFIED Requirements

### Requirement: Note Retrieval
The system SHALL allow an authenticated user to list their own, non-deleted notes and to read
any single one of them by id. Listing SHALL return the paginated envelope
`{ items, total, page, pageSize }` and SHALL support configurable pagination
(`page`, default 1; `pageSize`, default 20, maximum 100), sorting (`sortBy` — one of
`createdAt`, `updatedAt`, `title`; `sortDir` — `asc` or `desc`; defaulting to `updatedAt desc`
when omitted), and filtering by tag (`tagIds` — zero or more tag ids; a note matches only if it
has ALL specified tags, AND semantics). An unrecognized `sortBy` value SHALL be rejected. A
`tagIds` value that does not exist or is not owned by the caller SHALL simply match no notes,
not produce an error. Requesting a page beyond the last page of results SHALL return an empty
`items` array, not an error. Each returned note SHALL include its currently attached tags
(`id`, `name`, `color`) and its active share link, if any (`shareLink: { token, url, expiresAt,
viewCount } | null`). Reading a note that is soft-deleted or not owned by the caller SHALL
return not-found, indistinguishable from the note never having existed.

#### Scenario: List returns only the caller's own non-deleted notes
- **WHEN** an authenticated client lists notes with no query parameters
- **THEN** the system returns 200 with the envelope `{ items, total, page, pageSize }`
  containing only that caller's own non-deleted notes, `page` 1, `pageSize` 20, sorted by
  `updatedAt` descending

#### Scenario: Custom page size is honored up to the maximum
- **WHEN** an authenticated client lists notes with `pageSize=50`
- **THEN** the system returns up to 50 items per page and `pageSize: 50` in the envelope

#### Scenario: Page size above the maximum is capped
- **WHEN** an authenticated client lists notes with `pageSize=500`
- **THEN** the system caps the effective page size at 100

#### Scenario: Sorting by title ascending
- **WHEN** an authenticated client lists notes with `sortBy=title&sortDir=asc`
- **THEN** the system returns the caller's notes ordered alphabetically by title, ascending

#### Scenario: Unrecognized sortBy value rejected
- **WHEN** an authenticated client lists notes with `sortBy=nonsense`
- **THEN** the system rejects with 400

#### Scenario: Page beyond the last page returns an empty list
- **WHEN** an authenticated client lists notes with a `page` number greater than the number of
  available pages for their notes
- **THEN** the system returns 200 with an empty `items` array and accurate `total`/`page`/`pageSize`

#### Scenario: Reading a note not owned by the caller returns not found
- **WHEN** an authenticated client requests a note that exists but belongs to a different user
- **THEN** the system returns 404

#### Scenario: Reading a soft-deleted note returns not found
- **WHEN** an authenticated client requests a note that has been soft-deleted
- **THEN** the system returns 404, even for the note's owner

#### Scenario: Filtering by tag returns only notes having all specified tags
- **WHEN** an authenticated client lists notes with `tagIds` set to two of their own tag ids
- **THEN** the system returns only notes that have both of those tags attached

#### Scenario: Filtering by a tag id not owned by the caller returns an empty list
- **WHEN** an authenticated client lists notes with a `tagIds` value that does not exist or
  belongs to a different user
- **THEN** the system returns 200 with an empty `items` array, not an error

#### Scenario: A listed note includes its attached tags
- **WHEN** an authenticated client lists notes and one of their notes has tags attached
- **THEN** that note's entry in `items` includes a `tags` array with each attached tag's id,
  name, and color

#### Scenario: A note without an active share link has a null shareLink
- **WHEN** an authenticated client requests a note that has no active share link
- **THEN** the note's `shareLink` field is `null`

#### Scenario: A note with an active share link includes it
- **WHEN** an authenticated client requests a note that has an active share link
- **THEN** the note's `shareLink` field includes that link's `token`, `url`, `expiresAt`, and
  `viewCount`

### Requirement: Note Soft Delete
The system SHALL delete a note by setting a `deletedAt` timestamp only — the row itself SHALL
NOT be physically removed. Soft-deleted notes SHALL no longer appear in list or detail
endpoints for the owner. Deleting a note SHALL also revoke that note's active share link, if any
(soft-revoke, same as an explicit revocation). Deleting a note not owned by the caller SHALL
return not-found.

#### Scenario: Delete sets deletedAt instead of removing the row
- **WHEN** an authenticated client deletes their own note
- **THEN** the system sets that note's `deletedAt` to the current time, returns 204, and the
  underlying row still exists in the database

#### Scenario: Soft-deleted notes disappear from list and detail endpoints
- **WHEN** a note has been soft-deleted
- **THEN** it no longer appears in the owner's note list, and requesting it directly by id
  returns 404

#### Scenario: Deleting a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to delete a note that exists but belongs to a
  different user
- **THEN** the system returns 404 and does not delete the note

#### Scenario: Deleting a note revokes its active share link
- **WHEN** an authenticated client deletes their own note that has an active share link
- **THEN** the system revokes that share link, and it no longer grants public access
