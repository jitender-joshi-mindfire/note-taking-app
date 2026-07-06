## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Note Navigation Stubs
**Reason**: This requirement described temporary placeholder pages at `/notes/:id` and
`/notes/new`, explicitly scoped as "reserved for AB-1012 to implement fully." AB-1012 now
implements the real editor and new-note flow at both routes, so the stub behavior no longer
exists.
**Migration**: See the new `frontend-editor` capability — "New Note Auto-Creation" replaces the
"New note" stub scenario; "Rich Text Editing" and "Not-Found Handling" replace the `/notes/:id`
stub scenarios.
