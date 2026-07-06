# frontend-editor Specification

## Purpose
TBD - created by archiving change ab-1012-note-editor. Update Purpose after archive.
## Requirements
### Requirement: Rich Text Editing
The system SHALL present a TipTap-based editor at `/notes/:id` for an existing note's title and
content, with a toolbar exposing bold, italic, heading (H1/H2), bullet list, and numbered list
formatting. Opening the page SHALL load the note's current title and content into the editor.

#### Scenario: Opening an existing note loads its content into the editor
- **WHEN** an authenticated user navigates to `/notes/:id` for their own note
- **THEN** the editor displays that note's current title and content

#### Scenario: Applying formatting updates the editor content
- **WHEN** a user selects text and applies bold, italic, heading, or list formatting via the
  toolbar
- **THEN** the editor's content reflects that formatting

### Requirement: New Note Auto-Creation
The system SHALL, upon visiting `/notes/new`, immediately create a note with `title: "Untitled"`
and empty content via `POST /notes`, then navigate to `/notes/:id` using the newly created
note's id, so the editor always operates on a note that already exists in the backend.

#### Scenario: Visiting the new-note route creates a note and redirects to it
- **WHEN** an authenticated user navigates to `/notes/new`
- **THEN** the system creates a note titled "Untitled" and navigates to `/notes/:id` for that
  note's id, with the editor open and ready to edit

### Requirement: Debounced Autosave
The system SHALL save edits to a note's title or content via `PATCH /notes/:id` after the user
stops typing for approximately 2-3 seconds, coalescing rapid successive edits within that window
into a single save request rather than saving on every keystroke.

#### Scenario: A pause in typing triggers a save
- **WHEN** a user edits the title or content and then stops typing for the debounce interval
- **THEN** the system sends exactly one `PATCH /notes/:id` request containing the edited field(s)

#### Scenario: Rapid successive edits produce only one save request
- **WHEN** a user makes several edits in quick succession, each within the debounce window of
  the previous edit
- **THEN** the system sends only one `PATCH /notes/:id` request reflecting the final state, not
  one request per edit

### Requirement: Save Status Indicator
The system SHALL display a status indicator reflecting the autosave mutation's current state:
idle (no pending or recent save), saving (a request is in flight), saved (the most recent save
succeeded), or an error state (the most recent save failed).

#### Scenario: Status shows "Saving..." while a save is in flight
- **WHEN** a debounced autosave request has been sent and has not yet resolved
- **THEN** the status indicator shows a "Saving..." state

#### Scenario: Status shows "Saved" after a successful save
- **WHEN** an autosave request completes successfully
- **THEN** the status indicator shows a "Saved" state

#### Scenario: Status shows an error state if a save fails
- **WHEN** an autosave request fails
- **THEN** the status indicator shows an error state

### Requirement: Flush Pending Save on In-App Navigation
The system SHALL, when a user clicks a "Back to notes" control to leave the editor, immediately
send any pending debounced save before navigating away, rather than letting it be lost or
delayed until after navigation.

#### Scenario: Navigating back to the notes list flushes a pending save first
- **WHEN** a user has an unsaved edit still within the debounce window and clicks "Back to notes"
- **THEN** the system sends the pending save request before navigating to `/notes`

### Requirement: Empty Title Prevented
The system SHALL NOT autosave a note with an empty title. If the title is cleared to empty, the
system SHALL withhold the save and display a "Title is required" message instead of sending a
request the backend would reject.

#### Scenario: Clearing the title blocks autosave
- **WHEN** a user clears the note's title to empty and the debounce interval elapses
- **THEN** the system does not send a save request and displays a "Title is required" message

### Requirement: Not-Found Handling
The system SHALL display a not-found state at `/notes/:id` when the requested note does not
exist or is not owned by the authenticated caller, instead of showing the editor.

#### Scenario: Visiting the editor for an inaccessible note shows not-found
- **WHEN** a user navigates to `/notes/:id` for an id that doesn't exist or belongs to another
  user
- **THEN** the system displays a not-found message instead of the editor

