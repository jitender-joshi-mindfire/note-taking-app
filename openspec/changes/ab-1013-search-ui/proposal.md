## Why

FRS 6.1–6.3 (full-text search, highlighted snippets, pagination) are fully implemented on the
backend (AB-1007) but have no frontend surface yet. This ticket builds the search page that lets
a user actually find their own notes by content, seeing why each result matched.

## What Changes

- **Dedicated `/search` page** (decided during `/spec`): a new route with its own search input
  and results list, reached via a "Search" link from `/notes`. Kept separate from `NotesPage`
  rather than integrated into it — search has different, non-configurable ordering (fixed
  relevance, no `sortBy`/`tagIds` support in the backend's `GET /search` contract) and its own
  pagination envelope, so mixing the two into one page's state would add complexity for no
  benefit.
- **Debounced search-as-you-type** (FRS 6.1, decided during `/spec`): typing fires
  `GET /search` ~400ms after the user stops typing, for any non-empty query (matching the
  backend's own `searchQuerySchema` validation — no additional minimum length). Clearing the
  input back to empty shows a "search for something" prompt state rather than firing a request
  or showing an error.
- **Highlighted snippets** (FRS 6.2): each result shows the backend's `<mark>…</mark>`-wrapped
  snippet, parsed and rendered as real highlight styling — not via `dangerouslySetInnerHTML`, to
  avoid interpreting arbitrary note content as HTML (defense-in-depth; search is already scoped
  to the caller's own notes, so this isn't a cross-user attack vector, but rendering
  user-authored text as literal markup is still avoided as a matter of practice).
- **Known, disclosed limitation carried over from AB-1012** (decided during `/spec`): the
  backend's `ts_headline` highlighting (AB-1007) runs on the raw `content` string, which since
  AB-1012 is TipTap JSON, not plain text. Snippets on notes with real rich-text content will show
  JSON-polluted text with highlight markers until a future backend ticket fixes indexing (e.g. by
  extracting plain text before `to_tsvector`/`ts_headline`). This ticket renders whatever the
  backend returns, as-is — fixing backend search indexing is out of scope here (FRS 6.1/6.2/6.3
  are assigned to this ticket as frontend-only work).
- **Pagination** (FRS 6.3): the same numbered Previous/Next pattern as `NotesPage` (AB-1011), no
  sort control (search ordering is fixed by the backend).
- **Distinct empty states**: a "search for something" prompt before any query has been made, and
  a separate "no notes matched" message when a query returns zero results — these are
  intentionally different messages, not the same empty-state text.
- **Clicking a result** navigates to that note's real editor at `/notes/:id` (AB-1012) — reuses
  the existing route, no new navigation pattern.
- **Out of scope for this ticket**: fixing the backend's snippet quality (a backend/AB-1007
  follow-up, not assigned here), tag filtering on search (not supported by the backend's
  `GET /search` contract at all), sharing or version history from search results.

## Capabilities

### New Capabilities
- `frontend-search`: the search page — debounced query input, results with highlighted
  snippets, pagination, empty/no-results states, and the entry point link from the notes list,
  per FRS 6.1, 6.2, 6.3.

### Modified Capabilities
(none — `search` is a backend capability whose requirements are unchanged; this ticket only
consumes its existing `GET /search` contract. `frontend-notes` is not modified — the new "Search"
link is described as part of the new `frontend-search` capability's own entry-point requirement,
not a change to any existing `frontend-notes` requirement's described behavior.)

## Impact

- **New frontend code**: `frontend/src/pages/SearchPage.tsx`; `frontend/src/lib/searchApi.ts`
  (typed request function on top of the existing authenticated API client); a small
  snippet-rendering helper (parses `<mark>`/`</mark>` markers into safe React elements); a new
  `/search` route in `AppRoutes.tsx`; a "Search" link added to `NotesPage.tsx`.
- **No new dependency** — reuses TanStack Query, the existing `authenticatedFetch` client, and
  existing UI primitives.
- **No backend changes** — consumes the existing `GET /search` endpoint exactly as documented
  (SDS Section 5).
- **No changes to `packages/shared`** — reuses `searchQuerySchema`, `SearchQuery`,
  `SearchResultItem`, `SearchResponse` as-is.
- **No changes to `docs/SDS.md`** — no new API contract, status code, or DB field.
