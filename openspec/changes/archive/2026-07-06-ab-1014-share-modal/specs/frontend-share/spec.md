## ADDED Requirements

### Requirement: Share Entry Point
The system SHALL provide a "Share" button in the note editor's header that opens the share modal
for the note currently being edited.

#### Scenario: Clicking Share opens the modal for the current note
- **WHEN** an authenticated user viewing their own note in the editor clicks "Share"
- **THEN** the system opens the share modal for that note

### Requirement: No Active Link State
The system SHALL, when the current note has no active share link, show only the expiry-selection
UI in the modal, without any link details.

#### Scenario: A note with no active link shows the expiry-selection UI
- **WHEN** the share modal opens for a note with no active share link
- **THEN** the modal shows the expiry-selection options and no link URL, expiry, or view count

### Requirement: Generate Share Link
The system SHALL offer three preset expiry choices — 7, 30, or 90 days — for generating a share
link, and SHALL call the generate-link endpoint with the selected value when the note has no
existing active link, requiring no additional confirmation in that case.

#### Scenario: Generating a link for a note with no existing link shows the new link immediately
- **WHEN** a user selects an expiry preset and confirms generation for a note with no active link
- **THEN** the system creates the link and the modal immediately shows its URL, expiry, and a
  view count of 0

### Requirement: Regenerate Confirmation
The system SHALL, when the current note already has an active share link, require an inline
confirmation before generating a new one, since doing so immediately invalidates the existing
link.

#### Scenario: Generating a new link when one already exists shows a confirmation first
- **WHEN** a user selects an expiry preset and initiates generation for a note that already has
  an active share link
- **THEN** the system shows an inline confirmation before sending the generate request

#### Scenario: Confirming the regeneration replaces the link and shows the new one
- **WHEN** a user confirms regeneration after the warning
- **THEN** the system replaces the existing link and the modal shows the new link's URL, expiry,
  and a view count of 0

### Requirement: Active Link Display
The system SHALL, when the current note has an active share link, display its URL, expiry date,
and current view count when the modal opens.

#### Scenario: A note with an active link shows its URL, expiry, and view count
- **WHEN** the share modal opens for a note with an active share link
- **THEN** the modal displays that link's URL, expiry date, and current view count

### Requirement: Copy Link
The system SHALL provide a "Copy" action next to the active link's URL that copies it to the
clipboard and shows visible confirmation feedback.

#### Scenario: Clicking Copy copies the link and shows confirmation feedback
- **WHEN** a user clicks "Copy" next to an active share link's URL
- **THEN** the system copies that URL to the clipboard and displays a brief confirmation (e.g.
  the button reads "Copied!")

### Requirement: Revoke Share Link
The system SHALL require an inline confirmation before revoking the current note's active share
link, and SHALL return the modal to the no-active-link state once revocation succeeds.

#### Scenario: Revoking requires confirmation before the request fires
- **WHEN** a user clicks "Revoke" on an active share link
- **THEN** the system shows an inline confirmation before sending the revoke request

#### Scenario: Confirming revocation removes the active link and returns to the no-link state
- **WHEN** a user confirms revocation after the warning
- **THEN** the system revokes the link and the modal shows the no-active-link expiry-selection UI
