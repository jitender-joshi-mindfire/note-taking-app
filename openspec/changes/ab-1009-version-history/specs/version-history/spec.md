## ADDED Requirements

### Requirement: List Versions
The system SHALL allow an authenticated owner to list all retained versions of their own note,
newest first. The list SHALL contain only historical snapshots — the note's current live
title/content is not included as an entry (it remains available via the note's own retrieval
endpoint). Listing versions for a note that is soft-deleted or not owned by the caller SHALL
return not-found.

#### Scenario: Listing returns retained versions newest first
- **WHEN** an authenticated owner lists versions for their own note that has multiple versions
- **THEN** the system returns 200 with the versions ordered newest first

#### Scenario: Listing versions for a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to list versions for a note that exists but belongs
  to a different user
- **THEN** the system returns 404

#### Scenario: Listing versions for a soft-deleted note returns not found
- **WHEN** an authenticated client attempts to list versions for a note that has been
  soft-deleted
- **THEN** the system returns 404, even for the note's owner

### Requirement: View Version
The system SHALL allow an authenticated owner to view the full content of any retained version
of their own note. The requested version SHALL belong to the note specified in the URL — a
version id alone SHALL NOT be sufficient to view it if it belongs to a different note.
Requesting a version for a note that is soft-deleted or not owned by the caller, or a version id
that does not belong to the specified note, SHALL return not-found.

#### Scenario: Viewing a retained version returns its full content
- **WHEN** an authenticated owner requests one of their own note's retained versions by id
- **THEN** the system returns 200 with that version's `title`, `content`, and `createdAt`

#### Scenario: Viewing a version for a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to view a version of a note that exists but belongs
  to a different user
- **THEN** the system returns 404

#### Scenario: Viewing a version id that belongs to a different note returns not found
- **WHEN** an authenticated owner requests a version id that exists but belongs to a different
  one of their own notes than the one specified in the URL
- **THEN** the system returns 404

### Requirement: Restore Version
The system SHALL allow an authenticated owner to restore any retained version of their own note,
applying that version's `title` and `content` as the note's new current state. Restoring SHALL
create a new version snapshot of the note's state immediately prior to the restore — existing
version history SHALL NOT be deleted or reordered. Restoring content identical to the note's
current state SHALL proceed normally, with no special-casing. Restoring for a note that is
soft-deleted or not owned by the caller, or a version id that does not belong to the specified
note, SHALL return not-found.

#### Scenario: Restoring a version applies its content as the new current state
- **WHEN** an authenticated owner restores one of their own note's retained versions
- **THEN** the system returns 201 with the note now reflecting that version's `title` and
  `content`

#### Scenario: Restoring creates a new version without altering existing history
- **WHEN** an authenticated owner restores one of their own note's retained versions
- **THEN** the system creates a new version snapshot capturing the note's state immediately
  before the restore, and no existing version is deleted or reordered by this operation

#### Scenario: Restoring a note not owned by the caller returns not found
- **WHEN** an authenticated client attempts to restore a version of a note that exists but
  belongs to a different user
- **THEN** the system returns 404 and does not modify the note

#### Scenario: Restoring a version id that belongs to a different note returns not found
- **WHEN** an authenticated owner attempts to restore a version id that exists but belongs to a
  different one of their own notes than the one specified in the URL
- **THEN** the system returns 404 and does not modify the note
