# frontend-search Specification

## Purpose
TBD - created by archiving change ab-1013-search-ui. Update Purpose after archive.
## Requirements
### Requirement: Search Entry Point
The system SHALL provide a "Search" link on the notes list (`/notes`) that navigates to the
search page (`/search`).

#### Scenario: Clicking Search from the notes list navigates to the search page
- **WHEN** an authenticated user clicks "Search" on `/notes`
- **THEN** the system navigates to `/search`

### Requirement: Debounced Search
The system SHALL fire a search request (`GET /search`) approximately 400ms after the user stops
typing in the search input, for any non-empty query. The system SHALL NOT fire a request while
the input is empty, and SHALL coalesce rapid typing into a single request per pause, matching the
debounce pattern already established for autosave (AB-1012).

#### Scenario: Typing a query triggers a search after the debounce interval
- **WHEN** a user types a query and stops typing
- **THEN** the system sends exactly one `GET /search` request for that query after the debounce
  interval elapses

#### Scenario: An empty query does not trigger a search
- **WHEN** the search input is empty
- **THEN** the system does not send a search request

#### Scenario: Rapid typing produces only one search request
- **WHEN** a user types several characters in quick succession, each within the debounce window
  of the previous keystroke
- **THEN** the system sends only one `GET /search` request reflecting the final query, not one
  request per keystroke

### Requirement: Search Results Display
The system SHALL display each search result's matched note with its title, its highlighted
snippet, its attached tags, and its last-updated time.

#### Scenario: Search results show matching notes with their tags and updated time
- **WHEN** a search returns one or more matching notes
- **THEN** each result displays the note's title, snippet, tags, and last-updated time

### Requirement: Highlighted Snippet Rendering
The system SHALL render each result's snippet with its `<mark>…</mark>`-wrapped matches shown as
visually highlighted text, parsed safely into rendered elements rather than injected as raw HTML.

#### Scenario: Matched keywords in a snippet are visually highlighted
- **WHEN** a result's snippet contains one or more `<mark>…</mark>`-wrapped matches
- **THEN** the system renders those matches with visible highlight styling, distinct from the
  surrounding snippet text

### Requirement: Empty and No-Results States
The system SHALL display an explicit prompt before any search has been made, distinct from the
message shown when a search returns zero results.

#### Scenario: Before any search, an explicit prompt is shown
- **WHEN** a user visits `/search` and has not yet entered a query
- **THEN** the system displays an explicit prompt inviting them to search, not a blank page

#### Scenario: A query with no matches shows an explicit no-results message
- **WHEN** a search's query matches none of the user's notes
- **THEN** the system displays an explicit "no notes matched" message, distinct from the
  before-search prompt

### Requirement: Search Pagination
The system SHALL paginate search results using numbered Previous/Next controls driven by the
response envelope, matching the same pattern used by the notes list (AB-1011), without a sort
control (search ordering is fixed by the backend).

#### Scenario: Navigating to the next page requests the next page of search results
- **WHEN** a user on a search with multiple pages of results clicks "Next"
- **THEN** the system requests `page + 1` for the current query and replaces the displayed
  results with that page's items

#### Scenario: Previous is disabled on the first page
- **WHEN** a user is viewing page 1 of search results
- **THEN** the "Previous" control is disabled

#### Scenario: Next is disabled on the last page
- **WHEN** a user is viewing the last page of search results
- **THEN** the "Next" control is disabled

### Requirement: Navigating to a Search Result
The system SHALL navigate to a note's editor (`/notes/:id`) when a search result is clicked.

#### Scenario: Clicking a search result navigates to that note's editor
- **WHEN** a user clicks a search result
- **THEN** the system navigates to `/notes/:id` for that result's note

