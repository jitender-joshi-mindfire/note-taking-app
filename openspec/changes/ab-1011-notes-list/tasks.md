## 1. Foundation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [x] 1.1 Create `frontend/src/lib/apiClient.ts`: move `ApiError` here (from `authApi.ts`);
      implement `authenticatedFetch<T>(path, options): Promise<T>` — attaches
      `Authorization: Bearer <accessToken>` from `authStore`, parses JSON and throws `ApiError`
      on non-2xx, and on a `401` performs the silent refresh-and-retry flow (Decision 3/4): a
      module-level `inFlightRefresh` promise shared across concurrent callers so only one
      `POST /auth/refresh` call happens even if multiple requests 401 at once; on refresh
      success, persist new tokens via `authStore.login()` and retry the original request once;
      on refresh failure, or a second `401` on the retried request, call `authStore.logout()`
      and throw (no manual navigation — `RequireAuth`'s reactive session subscription handles the
      redirect)
- [x] 1.2 Update `frontend/src/lib/authApi.ts`: replace its `ApiError` definition with
      `export { ApiError } from "./apiClient";` — no other changes to this file
- [x] 1.3 Create `frontend/src/lib/notesApi.ts`: `listNotes(query: ListNotesQuery):
      Promise<NoteListResponse>` (builds the querystring from `page`/`pageSize`/`sortBy`/
      `sortDir`/`tagIds[]`), `getNote(id: string): Promise<NoteSummary>` (unwraps `{ note }`) —
      both via `authenticatedFetch`
- [x] 1.4 Create `frontend/src/lib/tagsApi.ts`: `listTags(): Promise<TagListResponse>` via
      `authenticatedFetch`
- [x] 1.5 Update `frontend/src/main.tsx`: set `new QueryClient({ defaultOptions: { queries: {
      retry: 1 } } })` (Decision 3 — avoids a multi-retry delay before `RequireAuth`'s redirect
      on a genuine session-expiry failure)
- [x] 1.6 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → 101
      backend + 14 existing frontend tests still green (no new tests yet)

## 2. Core Implementation

- [x] 2.1 Create `frontend/src/pages/NotesPage.tsx` (replaces `NotesPlaceholderPage.tsx`,
      Decision 5): keeps the existing "Logged in as {email}" line and logout button unchanged;
      adds local `useState` for `page`/`sortBy`/`sortDir`/`tagIds` (Decision 6); `useQuery(["tags"],
      listTags)` rendering each tag as a toggleable chip (`buttonVariants({ variant: "secondary"
      | "outline" })`, Decision 7) that toggles its id in/out of `tagIds` and resets `page` to 1;
      a native `<select>` mapping "Newest first"/"Oldest first"/"Recently updated" (default)/
      "Title A–Z"/"Title Z–A" to `sortBy`/`sortDir`, resetting `page` to 1 on change;
      `useQuery(["notes", { page, pageSize: 20, sortBy, sortDir, tagIds }], () => listNotes(...))`
      rendering each note's title, a truncated content preview, its `tags`, and `updatedAt`; an
      explicit empty state when `items.length === 0`; numbered pagination controls (Previous/Next
      + "page X of Y") disabled at the first/last page per `total`/`pageSize`; each note row
      links to `/notes/:id`; a "New note" button linking to `/notes/new`
- [x] 2.2 Create `frontend/src/pages/NoteDetailStubPage.tsx`: reads `:id` from the route,
      `useQuery(["note", id], () => getNote(id))`; renders the note's title/content read-only on
      success, an explicit not-found message when the query's error is an `ApiError` with
      `status === 404`
- [x] 2.3 Create `frontend/src/pages/NoteCreateStubPage.tsx`: static placeholder (no query, no
      form) noting that note creation ships in AB-1012
- [x] 2.4 Update `frontend/src/AppRoutes.tsx`: replace the `/notes` route's element with
      `NotesPage`; add `/notes/new` → `NoteCreateStubPage` and `/notes/:id` →
      `NoteDetailStubPage`, both wrapped in `RequireAuth`, `/notes/new` listed first (Decision 5);
      delete `frontend/src/pages/NotesPlaceholderPage.tsx`
- [x] 2.5 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → still
      green. Manually smoke-tested in a real browser (via the Preview tool) against the real
      backend (port 3000 was occupied by a stray `kubectl port-forward` again, same as prior
      tickets — ran the backend on port 4100 for the test, restored `.env` to port 3000
      afterward): seeded 25 notes + 2 tags via direct API calls, confirmed pagination
      ("Page 1 of 2" → "Page 2 of 2" with the remaining 5 notes), confirmed "Work" chip filters
      to 12 notes and adding "Personal" narrows to the 5 notes with both tags (AND semantics),
      confirmed "Title A–Z" sort reorders and resets to page 1, clicked a note into its stub
      detail page (title + content rendered), visited a random uuid and got "Note not found.",
      visited `/notes/new` and got the placeholder screen, confirmed a fresh zero-note account
      shows "No notes yet.", corrupted the stored access token and confirmed a transparent
      silent refresh (new access token persisted, list still rendered), then corrupted both
      tokens and confirmed a hard logout + redirect to `/login` with the session cleared —
      zero browser console errors/warnings across every scenario

## 3. Tests (one per spec scenario)

New tests under `frontend/src/lib/apiClient.test.ts`, `frontend/src/pages/NotesPage.test.tsx`,
`frontend/src/pages/NoteDetailStubPage.test.tsx`, and `frontend/src/pages/
NoteCreateStubPage.test.tsx` — 18 spec scenarios (5 `frontend-api-client` + 13 `frontend-notes`)
plus one test beyond the spec's literal scenarios covering the concurrency mutex from Decision 3
(flagged as a design-level risk, not a spec scenario):

- [ ] 3.1 Test: A request includes the current access token
- [ ] 3.2 Test: Expired access token triggers a silent refresh and retry
- [ ] 3.3 Test: The retried request's response is returned to the caller
- [ ] 3.4 Test: Refresh failure clears the session and redirects to login
- [ ] 3.5 Test: A second 401 after a successful refresh is treated as a final failure
- [ ] 3.6 Test (beyond spec, Decision 3): two concurrent `authenticatedFetch` calls that both
      401 at once trigger exactly one `POST /auth/refresh` call, not two
- [ ] 3.7 Test: Notes list renders the caller's notes
- [ ] 3.8 Test: Empty notes list shows an explicit empty state
- [ ] 3.9 Test: Navigating to the next page requests the next page from the backend
- [ ] 3.10 Test: Previous is disabled on the first page
- [ ] 3.11 Test: Next is disabled on the last page
- [ ] 3.12 Test: Changing sort re-fetches and resets to page 1
- [ ] 3.13 Test: Default sort matches the backend's default
- [ ] 3.14 Test: Toggling a tag chip on filters the list
- [ ] 3.15 Test: Toggling multiple tags requires all of them (AND semantics)
- [ ] 3.16 Test: Toggling a chip off removes it from the filter
- [ ] 3.17 Test: Clicking a note navigates to its stub detail page
- [ ] 3.18 Test: The "New note" button navigates to the stub creation page
- [ ] 3.19 Test: Visiting the stub detail page for a note the caller can't access shows
      not-found
- [ ] 3.20 Rename `NotesPlaceholderPage.test.tsx` → fold its two existing logout scenarios
      ("Logging out clears the session and navigates to login", "...even if the backend logout
      call fails") into `NotesPage.test.tsx` unchanged — they're already-covered `frontend-auth`
      scenarios from AB-1010, not re-counted here, just relocated with the file they test
- [ ] 3.21 Update `AppRoutes.test.tsx`: mock `@/lib/notesApi` and `@/lib/tagsApi` (same pattern
      as the existing `authApi` mock) so its two existing route-protection scenarios don't make
      real network calls now that `NotesPage` issues real queries

- [ ] 3.22 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green, ≥80% coverage on new files (backend 101/101 unaffected)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1011-notes-list`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1011 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
