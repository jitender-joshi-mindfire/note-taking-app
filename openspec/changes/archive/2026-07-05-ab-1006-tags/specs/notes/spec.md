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
(`id`, `name`, `color`). Reading a note that is soft-deleted or not owned by the caller SHALL
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

### Requirement: Note Update
The system SHALL allow an authenticated user to partially update their own note's `title`,
`content`, and/or tag set. A request with none of `title`, `content`, or `tagIds` SHALL be
rejected. When `tagIds` is present, it SHALL replace the note's complete set of attached tags
(replace-set semantics, not incremental add/remove); an empty array SHALL remove all tags. A
`tagIds` entry that does not exist or is not owned by the caller SHALL cause the request to be
rejected with 400 and SHALL NOT partially apply. Every update SHALL create a version snapshot of
the note's prior state before applying the change. Updating a note not owned by the caller SHALL
return not-found.

#### Scenario: Partial update applies only the provided fields
- **WHEN** an authenticated client updates only `title` (or only `content`) on their own note
- **THEN** the system applies that field and leaves the other field unchanged, returning 200
  with the updated note

#### Scenario: Update with no fields rejected
- **WHEN** an authenticated client submits an update with none of `title`, `content`, or
  `tagIds`
- **THEN** the system rejects with 400

#### Scenario: Update creates a version snapshot of the prior state
- **WHEN** an authenticated client successfully updates their own note
- **THEN** the system creates a new `NoteVersion` capturing the note's title and content as they
  were immediately before this update was applied

#### Scenario: Updating a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to update a note that exists but belongs to a
  different user
- **THEN** the system returns 404 and does not modify the note

#### Scenario: Providing tagIds replaces the note's tag set
- **WHEN** an authenticated client updates their own note with `tagIds` set to a list of their
  own tag ids
- **THEN** the system attaches exactly those tags to the note, detaching any previously attached
  tag not in the list

#### Scenario: Providing an empty tagIds array clears all tags
- **WHEN** an authenticated client updates their own note with `tagIds` set to an empty array
- **THEN** the system detaches all tags from the note

#### Scenario: tagIds referencing a tag not owned by the caller is rejected
- **WHEN** an authenticated client updates their own note with `tagIds` containing an id that
  does not exist or belongs to a different user
- **THEN** the system rejects with 400 and does not modify the note's tags
