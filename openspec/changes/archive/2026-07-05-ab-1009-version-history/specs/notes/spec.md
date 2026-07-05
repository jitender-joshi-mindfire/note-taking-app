## MODIFIED Requirements

### Requirement: Note Update
The system SHALL allow an authenticated user to partially update their own note's `title`,
`content`, and/or tag set. A request with none of `title`, `content`, or `tagIds` SHALL be
rejected. When `tagIds` is present, it SHALL replace the note's complete set of attached tags
(replace-set semantics, not incremental add/remove); an empty array SHALL remove all tags. A
`tagIds` entry that does not exist or is not owned by the caller SHALL cause the request to be
rejected with 400 and SHALL NOT partially apply. Every update SHALL create a version snapshot of
the note's prior state before applying the change. The note's retained version history SHALL be
capped at the 50 most recent versions — when creating a version would exceed that cap, the
oldest version(s) SHALL be deleted in the same operation. Updating a note not owned by the
caller SHALL return not-found.

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

#### Scenario: Version history beyond 50 is automatically purged
- **WHEN** an authenticated client's update would create a note's 51st version
- **THEN** the system deletes the oldest version(s) so that no more than 50 versions remain
  retained for that note
