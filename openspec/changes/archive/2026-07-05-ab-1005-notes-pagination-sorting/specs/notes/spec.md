## MODIFIED Requirements

### Requirement: Note Retrieval
The system SHALL allow an authenticated user to list their own, non-deleted notes and to read
any single one of them by id. Listing SHALL return the paginated envelope
`{ items, total, page, pageSize }` and SHALL support configurable pagination
(`page`, default 1; `pageSize`, default 20, maximum 100) and sorting (`sortBy` — one of
`createdAt`, `updatedAt`, `title`; `sortDir` — `asc` or `desc`; defaulting to `updatedAt desc`
when omitted). An unrecognized `sortBy` value SHALL be rejected. Requesting a page beyond the
last page of results SHALL return an empty `items` array, not an error. Reading a note that is
soft-deleted or not owned by the caller SHALL return not-found, indistinguishable from the note
never having existed. Filtering by tag is explicitly out of scope for this requirement (see
`docs/TICKETS.md` — deferred to AB-1006, `Tag` does not exist yet).

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
