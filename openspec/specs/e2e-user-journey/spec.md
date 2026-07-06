# e2e-user-journey Specification

## Purpose
TBD - created by archiving change ab-1016-e2e-playwright. Update Purpose after archive.
## Requirements
### Requirement: Registration Enters the Authenticated App
The E2E journey SHALL register a new user with a freshly-generated, unique email through the
real registration UI and land in the authenticated notes area.

#### Scenario: Registering a new account signs the user in
- **WHEN** the journey submits the registration form with a freshly-generated unique email and a
  valid password
- **THEN** the user is authenticated and the notes list page is shown

### Requirement: Note Creation and Editing Produces Retained Versions
The E2E journey SHALL create a note and edit its title/content at least twice through the real
editor UI, producing multiple retained versions of that note.

#### Scenario: Creating and editing a note accumulates versions
- **WHEN** the journey creates a new note and then edits its title/content twice, each edit
  followed by its autosave completing
- **THEN** the note has at least two retained versions in addition to its current state

### Requirement: Tag Filtering Shows Only Tagged Notes
The E2E journey SHALL verify that filtering the notes list by a tag shows only notes carrying
that tag, using a tag and note-tag attachment seeded directly via the backend API (since no
frontend UI exists to create or attach a tag).

#### Scenario: Filtering by a tag shows only the tagged note
- **WHEN** a tag has been created and attached to the journey's note via the API, and the user
  selects that tag as a filter on the notes list
- **THEN** the filtered list shows the tagged note and excludes notes without that tag

### Requirement: Search Finds the Created Note
The E2E journey SHALL search for a distinctive word from the created note's content and confirm
the note appears in the search results.

#### Scenario: Searching for note content returns the note
- **WHEN** the user searches for a distinctive word taken from the note's current content
- **THEN** the note appears in the search results

### Requirement: A Generated Share Link Is Publicly Viewable
The E2E journey SHALL generate a share link for the note through the real UI, then request that
link's URL without any authentication and confirm it returns the note's title and content. The
share link resolves to a backend JSON endpoint (`GET /api/share/:token`, FRS 7.3) — there is no
frontend page that renders it, so "publicly viewable" is verified at the HTTP level, not via a
rendered page.

#### Scenario: An unauthenticated request to a share link returns the note's content
- **WHEN** the user generates a share link for the note, and an HTTP request is made to that
  link's URL with no authentication credentials
- **THEN** the request succeeds and its response contains the shared note's title and content

### Requirement: Restoring an Earlier Version Updates the Live Note
The E2E journey SHALL open the note's version history, restore the version whose content matches
the note's state after its first edit (identified by that edit's distinctive title, not by list
position or an assumed version count — creating a note and then editing it twice retains more
than two version rows, since both note creation and every update each snapshot a version), and
confirm the editor's displayed title and content update to reflect the restored version.

#### Scenario: Restoring an earlier version updates the editor in place
- **WHEN** the user opens version history, selects the version matching the note's state after
  its first edit, and restores it
- **THEN** the editor's displayed title and content update to match that earlier version, without
  navigating away from the page

