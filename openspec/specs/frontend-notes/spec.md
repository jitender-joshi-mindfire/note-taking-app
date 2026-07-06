# frontend-notes Specification

## Purpose
TBD - created by archiving change ab-1011-notes-list. Update Purpose after archive.
## Requirements
### Requirement: Notes List Display
The system SHALL display the authenticated user's own notes at `/notes`, fetched via the
authenticated API client, showing each note's title, a content preview, its attached tags, and
last-updated time. The content preview SHALL be plain text extracted from the note's TipTap JSON
content (never the raw JSON string), so it remains human-readable regardless of what formatting
the content was authored with. An empty result SHALL show an explicit empty state rather than a
blank list.

#### Scenario: Notes list renders the caller's notes
- **WHEN** an authenticated user visits `/notes` and has one or more notes
- **THEN** the system displays each note's title, a plain-text content preview, tags, and
  last-updated time

#### Scenario: A note with rich-text formatting shows a plain-text preview
- **WHEN** a note's content includes TipTap formatting (e.g. bold text, a heading, or a list)
- **THEN** the list preview shows the extracted plain text of that content, with no JSON syntax
  or formatting markup visible

#### Scenario: Empty notes list shows an explicit empty state
- **WHEN** an authenticated user visits `/notes` and has no notes
- **THEN** the system displays an explicit "no notes yet" message instead of an empty list

### Requirement: Pagination
The system SHALL paginate the notes list using numbered page controls (Previous/Next plus the
current page and total) driven directly by the backend's response envelope, without accumulating
pages client-side.

#### Scenario: Navigating to the next page requests the next page from the backend
- **WHEN** a user on a list with multiple pages clicks "Next"
- **THEN** the system requests `page + 1` from the backend and replaces the displayed notes with
  that page's items

#### Scenario: Previous is disabled on the first page
- **WHEN** a user is viewing page 1
- **THEN** the "Previous" control is disabled

#### Scenario: Next is disabled on the last page
- **WHEN** a user is viewing the last page (`page * pageSize >= total`)
- **THEN** the "Next" control is disabled

### Requirement: Sorting
The system SHALL provide a single sort control mapping human-readable choices ("Newest first",
"Oldest first", "Recently updated", "Title A–Z", "Title Z–A") to the backend's `sortBy`/`sortDir`
query parameters, defaulting to "Recently updated" (`updatedAt` descending, matching the
backend's own default), and resetting to page 1 whenever the sort selection changes.

#### Scenario: Changing sort re-fetches and resets to page 1
- **WHEN** a user selects a different sort option while viewing a page other than page 1
- **THEN** the system re-fetches page 1 with the new `sortBy`/`sortDir`

#### Scenario: Default sort matches the backend's default
- **WHEN** a user visits `/notes` with no prior sort selection
- **THEN** the system requests notes sorted by `updatedAt` descending and shows "Recently updated"
  as the selected sort option

### Requirement: Tag Filtering
The system SHALL fetch the caller's tags and render each as a toggleable chip above the notes
list; toggling a chip adds or removes its id from the active `tagIds` filter (AND semantics,
matching the backend) and resets to page 1.

#### Scenario: Toggling a tag chip on filters the list
- **WHEN** a user toggles a tag chip on
- **THEN** the system re-fetches notes with that tag's id included in `tagIds`, resetting to
  page 1

#### Scenario: Toggling multiple tags requires all of them (AND semantics)
- **WHEN** a user toggles two tag chips on
- **THEN** the system requests notes filtered by both tag ids together

#### Scenario: Toggling a chip off removes it from the filter
- **WHEN** a user toggles an already-active tag chip off
- **THEN** the system re-fetches notes without that tag id in `tagIds`, resetting to page 1

