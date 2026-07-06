## ADDED Requirements

### Requirement: History Entry Point
The system SHALL provide a "History" button in the note editor's header that opens the version
history view for the note currently being edited.

#### Scenario: Clicking History opens the version history view for the current note
- **WHEN** an authenticated user viewing their own note in the editor clicks "History"
- **THEN** the system opens the version history view listing that note's retained versions

### Requirement: List Retained Versions
The system SHALL list the current note's retained versions ordered newest first, each showing
its title and timestamp.

#### Scenario: Versions are listed newest first
- **WHEN** a note has multiple retained versions
- **THEN** the version history view lists them ordered newest first, each showing its title and
  timestamp

### Requirement: View Version Content
The system SHALL display a selected version's content as plain text when the user selects it
from the list.

#### Scenario: Selecting a version shows its title and content
- **WHEN** a user selects a version from the list
- **THEN** the system displays that version's title and its content as plain text

### Requirement: Restore Confirmation
The system SHALL require an inline confirmation before restoring a version, since restoring
replaces the note's current title and content.

#### Scenario: Restoring requires confirmation before the request fires
- **WHEN** a user clicks "Restore" on a version
- **THEN** the system shows an inline confirmation before sending the restore request

### Requirement: Restore Updates the Live Editor
The system SHALL, upon a successful restore, update the note editor's displayed title and
content to reflect the restored version, without requiring the user to navigate away and back.

#### Scenario: Confirming restore updates the note's live content
- **WHEN** a user confirms restoring a version
- **THEN** the system restores it and the editor's displayed title and content update to reflect
  the restored version
