# notes Specification

## Purpose
TBD - created by archiving change ab-1004-notes-crud. Update Purpose after archive.
## Requirements
### Requirement: Note Creation
The system SHALL allow an authenticated user to create a note with a required, non-empty
`title` and a `content` field that may be empty. The created note SHALL belong only to the
authenticated caller. Creating a note SHALL produce its first version snapshot.

#### Scenario: Successful note creation
- **WHEN** an authenticated client submits a non-empty title and any content (including empty)
- **THEN** the system creates the note owned by that caller and returns 201 with the note

#### Scenario: Empty title rejected
- **WHEN** an authenticated client submits a request with a missing or empty title
- **THEN** the system rejects with 400 and a field-level error for `title`

#### Scenario: Creation produces the first version snapshot
- **WHEN** a note is successfully created
- **THEN** the system creates exactly one `NoteVersion` capturing that note's initial title and
  content

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

### Requirement: Note Update
The system SHALL allow an authenticated user to partially update their own note's `title`
and/or `content`. A request with neither field SHALL be rejected. Every update SHALL create a
version snapshot of the note's prior state before applying the change. Updating a note not
owned by the caller SHALL return not-found.

#### Scenario: Partial update applies only the provided fields
- **WHEN** an authenticated client updates only `title` (or only `content`) on their own note
- **THEN** the system applies that field and leaves the other field unchanged, returning 200
  with the updated note

#### Scenario: Update with no fields rejected
- **WHEN** an authenticated client submits an update with neither `title` nor `content`
- **THEN** the system rejects with 400

#### Scenario: Update creates a version snapshot of the prior state
- **WHEN** an authenticated client successfully updates their own note
- **THEN** the system creates a new `NoteVersion` capturing the note's title and content as they
  were immediately before this update was applied

#### Scenario: Updating a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to update a note that exists but belongs to a
  different user
- **THEN** the system returns 404 and does not modify the note

### Requirement: Note Soft Delete
The system SHALL delete a note by setting a `deletedAt` timestamp only — the row itself SHALL
NOT be physically removed. Soft-deleted notes SHALL no longer appear in list or detail
endpoints for the owner. Deleting a note not owned by the caller SHALL return not-found.

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

