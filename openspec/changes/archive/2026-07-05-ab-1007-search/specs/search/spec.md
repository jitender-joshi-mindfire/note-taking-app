## ADDED Requirements

### Requirement: Full-Text Search
The system SHALL allow an authenticated user to search their own, non-deleted notes by matching
a natural-language query string against each note's `title` and `content`, using PostgreSQL
full-text search (no external search service). A missing or empty query SHALL be rejected with
400. A query with no matches SHALL return an empty result, not an error. Each result SHALL
include the matched note (the same shape as `GET /notes`, including its `tags`) alongside a
highlighted snippet.

#### Scenario: Successful search returns matching notes
- **WHEN** an authenticated client searches with a query matching one or more of their own notes
- **THEN** the system returns 200 with those notes in the results, each including the note object
  and a snippet

#### Scenario: Search excludes another user's notes
- **WHEN** an authenticated client searches with a query that would match another user's note
- **THEN** that other user's note SHALL NOT appear in the results

#### Scenario: Search excludes soft-deleted notes
- **WHEN** an authenticated client searches with a query matching one of their own soft-deleted
  notes
- **THEN** that note SHALL NOT appear in the results

#### Scenario: Missing or empty query rejected
- **WHEN** an authenticated client searches with a missing or empty `q` parameter
- **THEN** the system rejects with 400

#### Scenario: Query with no matches returns an empty result
- **WHEN** an authenticated client searches with a query that matches none of their notes
- **THEN** the system returns 200 with an empty `items` array

### Requirement: Search Result Highlighting
Each search result SHALL include a `snippet` derived from the note's `content`, with matched
keywords wrapped in a delimiter the frontend can render as highlighting (`<mark>…</mark>`). The
note's `title` SHALL be returned as plain text — highlighting applies to the content-derived
snippet only, not the title field.

#### Scenario: Matched keywords are highlighted in the snippet
- **WHEN** a search result's note content contains the query term
- **THEN** the result's `snippet` wraps each matched occurrence in `<mark>` and `</mark>`

#### Scenario: Title is not highlighted
- **WHEN** a search result's note title contains the query term
- **THEN** the note's `title` field in the result is returned as plain text, with no highlighting
  markup applied

### Requirement: Search Ranking and Pagination
Search results SHALL be ordered by relevance (descending `ts_rank`), with ties broken by
`updatedAt` descending — this ordering is fixed and is NOT configurable via `sortBy`/`sortDir`.
Results SHALL be paginated using the same convention as note listing: `page` (default 1),
`pageSize` (default 20, maximum 100), returned in the envelope
`{ items, total, page, pageSize }`.

#### Scenario: Results are ordered by relevance
- **WHEN** an authenticated client's query matches multiple notes with differing relevance
- **THEN** the results are ordered by relevance, most relevant first

#### Scenario: Custom page size is honored up to the maximum
- **WHEN** an authenticated client searches with `pageSize=50`
- **THEN** the system returns up to 50 items per page and `pageSize: 50` in the envelope

#### Scenario: Page beyond the last page returns an empty list
- **WHEN** an authenticated client searches with a `page` number greater than the number of
  available result pages
- **THEN** the system returns 200 with an empty `items` array and accurate `total`/`page`/`pageSize`
