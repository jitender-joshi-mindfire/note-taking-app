## ADDED Requirements

### Requirement: Tag Creation
The system SHALL allow an authenticated user to create a tag scoped to themselves, with a
required `name` (1–50 characters) and an optional `color` (a 6-digit hex string, `#RRGGBB`). Tag
`name` SHALL be unique per user, case-insensitively. A duplicate name (case-insensitive) for the
same user SHALL be rejected.

#### Scenario: Successful tag creation with name only
- **WHEN** an authenticated client creates a tag with a non-empty name and no color
- **THEN** the system creates the tag owned by that caller and returns 201 with the tag

#### Scenario: Successful tag creation with name and color
- **WHEN** an authenticated client creates a tag with a name and a valid hex color (`#RRGGBB`)
- **THEN** the system creates the tag with that color and returns 201 with the tag

#### Scenario: Duplicate tag name rejected case-insensitively
- **WHEN** an authenticated client creates a tag whose name matches (case-insensitively) an
  existing tag of theirs
- **THEN** the system rejects with 409

#### Scenario: Empty or over-length tag name rejected
- **WHEN** an authenticated client submits a tag name that is empty or longer than 50 characters
- **THEN** the system rejects with 400 and a field-level error for `name`

#### Scenario: Invalid color format rejected
- **WHEN** an authenticated client submits a `color` value that is not a 6-digit hex string
- **THEN** the system rejects with 400 and a field-level error for `color`

### Requirement: Tag Listing
The system SHALL allow an authenticated user to list their own tags. Each tag in the list SHALL
include `noteCount` — the count of that tag's non-deleted notes, computed live, never
denormalized.

#### Scenario: Listing returns only the caller's own tags
- **WHEN** an authenticated client lists tags
- **THEN** the system returns 200 with only that caller's own tags

#### Scenario: Note count reflects only non-deleted notes currently tagged
- **WHEN** a tag is attached to two notes, one of which is later soft-deleted
- **THEN** that tag's `noteCount` in the list response is 1

#### Scenario: Newly created tag appears with a note count of zero
- **WHEN** an authenticated client creates a new tag and then lists their tags
- **THEN** that tag appears with `noteCount: 0`

### Requirement: Tag Update
The system SHALL allow an authenticated user to partially update their own tag's `name` and/or
`color`. A request with neither field SHALL be rejected. Renaming a tag to a name that collides
(case-insensitively) with another of the caller's tags SHALL be rejected. Updating a tag not
owned by the caller SHALL return not-found.

#### Scenario: Partial update applies only the provided fields
- **WHEN** an authenticated client updates only `name` (or only `color`) on their own tag
- **THEN** the system applies that field and leaves the other field unchanged, returning 200
  with the updated tag

#### Scenario: Update with no fields rejected
- **WHEN** an authenticated client submits an update with neither `name` nor `color`
- **THEN** the system rejects with 400

#### Scenario: Renaming to a name colliding with another of the caller's tags is rejected
- **WHEN** an authenticated client renames a tag to a name that matches (case-insensitively)
  another one of their own tags
- **THEN** the system rejects with 409

#### Scenario: Updating a tag not owned by the caller returns not found
- **WHEN** an authenticated client attempts to update a tag that exists but belongs to a
  different user
- **THEN** the system returns 404 and does not modify the tag

### Requirement: Tag Deletion
The system SHALL allow an authenticated user to delete their own tag. Deleting a tag SHALL
remove the tag-note association for every note it was attached to, but SHALL NOT delete or
otherwise modify those notes. Deleting a tag not owned by the caller SHALL return not-found.

#### Scenario: Deleting a tag removes it from all notes without deleting the notes
- **WHEN** an authenticated client deletes a tag attached to one or more of their notes
- **THEN** the system returns 204, the tag no longer appears on any note, and none of those
  notes are deleted or otherwise modified

#### Scenario: Deleting a tag not owned by the caller returns not found
- **WHEN** an authenticated client attempts to delete a tag that exists but belongs to a
  different user
- **THEN** the system returns 404 and does not delete the tag
