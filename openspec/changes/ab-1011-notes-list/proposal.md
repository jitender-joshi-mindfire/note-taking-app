## Why

FRS 4.2 (read/list), 4.5 (pagination & sorting), and 4.6 (tag filtering) are fully implemented on
the backend (AB-1004, AB-1005, AB-1006) but have no user-facing surface yet. This ticket builds
the notes list page that lets an authenticated user actually see, page through, sort, and filter
their own notes. It also builds the shared authenticated API client that every remaining frontend
ticket (AB-1012–1015) depends on — AB-1010 explicitly deferred this, since none of its pages
called a protected endpoint.

## What Changes

- **Authenticated API client** (`frontend/src/lib/apiClient.ts`): a `fetch` wrapper that attaches
  `Authorization: Bearer <accessToken>` from `authStore` to every request. On a `401`, it calls
  `POST /api/auth/refresh` once with the stored refresh token, retries the original request with
  the new access token on success, and — if refresh also fails — clears the session and redirects
  to `/login` (matching AB-1010's `authStore.logout()` behavior). This is new scope beyond
  FRS 4.2/4.5/4.6 themselves, but is a hard prerequisite for calling `GET /notes` or `GET /tags`
  at all; every subsequent frontend ticket reuses this client rather than rebuilding it.
- **Notes list page** (replaces the placeholder content at `/notes`, FRS 4.2): fetches
  `GET /notes` via TanStack Query, rendering each note's title, a content preview, its tags, and
  last-updated time. An empty list shows an explicit "no notes yet" state rather than a blank
  page.
- **Pagination** (FRS 4.5.1): numbered page controls (Previous / current page of total / Next)
  driven directly by the response envelope's `page`/`pageSize`/`total` — no client-side page
  accumulation.
- **Sorting** (FRS 4.5.2): a single dropdown mapping human-readable choices ("Newest first",
  "Oldest first", "Recently updated", "Title A–Z", "Title Z–A") to the `sortBy`/`sortDir` query
  pair; changing it resets to page 1.
- **Tag filtering** (FRS 4.6.1): fetches `GET /tags` and renders each as a toggleable chip above
  the list; toggling a chip adds/removes its id from the `tagIds` query param (AND semantics,
  matching the backend) and resets to page 1.
- **Note click → stub detail route**: clicking a note navigates to `/notes/:id`, a minimal
  read-only stub page (title + content, no editing) that exists purely to prove navigation works
  end-to-end. AB-1012 replaces its contents with the real TipTap editor; the route doesn't change.
  This mirrors AB-1010's own placeholder-page pattern.
- **"New note" stub entry point**: a visible "New note" button navigates to a `/notes/new` stub
  route (same minimal treatment as the detail stub — a placeholder screen, not a working creation
  form) rather than being hidden or disabled. Actual note creation (FRS 4.1) is out of scope for
  this ticket and is built in AB-1012.
- **Out of scope for this ticket**: creating, editing, or deleting notes (FRS 4.1, 4.3, 4.4 —
  AB-1012), search (FRS 6.x — AB-1013), sharing (FRS 7.x — AB-1014), version history (FRS 8.x —
  AB-1015). The two stub routes above exist only as navigation targets, not functional pages.

## Capabilities

### New Capabilities
- `frontend-notes`: notes list page — fetching, pagination, sorting, tag filtering, and the
  navigation stubs it links to, per FRS 4.2, 4.5, 4.6.
- `frontend-api-client`: the shared authenticated `fetch` wrapper (token attachment + silent
  refresh-on-401 + logout-on-refresh-failure) used by all authenticated frontend requests from
  this ticket onward.

### Modified Capabilities
(none — `notes` and `tags` are backend capabilities whose requirements are unchanged; this ticket
only consumes their existing contracts)

## Impact

- **New frontend code**: `frontend/src/lib/apiClient.ts`; `frontend/src/lib/notesApi.ts` and
  `tagsApi.ts` (typed request functions built on `apiClient`); `frontend/src/pages/NotesPage.tsx`
  (replaces `NotesPlaceholderPage.tsx`'s content, same route); `frontend/src/pages/NoteDetailStubPage.tsx`
  and `NoteCreateStubPage.tsx`; new routes `/notes/:id` and `/notes/new` in `AppRoutes.tsx`.
- **New dependency surface**: TanStack Query is already installed (per `frontend/CLAUDE.md`) but
  this is the first ticket to actually use it for a real query — no new package needed.
- **No backend changes** — this ticket only consumes the existing `/api/notes` and `/api/tags`
  endpoints (SDS Section 5).
- **No changes to `packages/shared`** — reuses `NoteSummary`, `NoteListResponse`,
  `ListNotesQuery`, and the existing tag types as-is.
- **No changes to `docs/SDS.md`** — no new API contract or DB schema involved.
