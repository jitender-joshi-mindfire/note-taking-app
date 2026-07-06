## 1. Foundation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [ ] 1.1 Create `frontend/src/lib/searchApi.ts`: `search(query: SearchQuery):
      Promise<SearchResponse>` (builds the querystring from `q`/`page`/`pageSize`) via
      `authenticatedFetch`
- [ ] 1.2 Create `frontend/src/lib/searchSnippet.ts` (Decision 2): `parseSnippet(snippet:
      string): { text: string; highlighted: boolean }[]` — splits on
      `/(<mark>.*?<\/mark>)/g`, classifying each piece as highlighted (tags stripped) or plain
- [ ] 1.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → 50
      frontend + 101 backend tests still green (no new tests yet)

## 2. Core Implementation

- [ ] 2.1 Create `frontend/src/pages/SearchPage.tsx` (Decision 1 — declarative debounce, not
      `NoteEditorPage`'s imperative pattern): local `useState` for `q`/`debouncedQuery`/`page`; a
      `useEffect` that debounces `q` → `debouncedQuery` after 400ms and resets `page` to 1;
      `useQuery(["search", { q: debouncedQuery, page, pageSize: 20 }], () => search(...), {
      enabled: debouncedQuery.length > 0 })`; before-search prompt when `debouncedQuery` is
      empty; no-results message when a query returns `items: []`; each result renders the note's
      title, its snippet passed through `parseSnippet` and mapped to `<mark>`/plain text nodes
      (Decision 2 — never `dangerouslySetInnerHTML`), its tags, and updated time, wrapped in a
      `<Link to="/notes/:id">`; numbered Previous/Next pagination matching `NotesPage`'s exact
      pattern, no sort control
- [ ] 2.2 Update `frontend/src/AppRoutes.tsx`: add `/search` → `SearchPage`, wrapped in
      `RequireAuth`, not lazy-loaded (Decision 3)
- [ ] 2.3 Update `frontend/src/pages/NotesPage.tsx`: add a "Search" link next to "New note" in
      the existing header row (Decision 4)
- [ ] 2.4 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` (confirm no new
      chunk-size warning, validating Decision 3), `pnpm test` → still green. Manually
      smoke-test in a real browser (via the Preview tool) against the running backend: search
      for a term matching an existing note, confirm via the Preview tool's network inspector
      that exactly one `GET /search` request fires per typing pause (not one per keystroke) and
      none fires while the input is empty; confirm the snippet's matched text is visually
      highlighted; confirm pagination across multiple result pages; confirm the before-search
      prompt and the no-results message are visually distinct (search for a nonsense term with
      zero matches); click a result and confirm it opens the real note editor; click "Search"
      from `/notes` and confirm it navigates to `/search`; confirm zero browser console
      warnings/errors throughout

## 3. Tests (one per spec scenario)

New tests under `frontend/src/lib/searchSnippet.test.ts` and `frontend/src/pages/
SearchPage.test.tsx` — 12 `frontend-search` scenarios, plus a beyond-spec unit-test file for
`searchSnippet.ts` (design.md flags its regex-based parsing as load-bearing and worth testing
directly, not just indirectly through page-level rendering):

- [ ] 3.1 Test (beyond spec): `parseSnippet` returns a single unhighlighted segment for plain
      text with no `<mark>` tags
- [ ] 3.2 Test (beyond spec): `parseSnippet` extracts a `<mark>`-wrapped segment as highlighted,
      correctly interleaved with the surrounding plain-text segments
- [ ] 3.3 Test (beyond spec): `parseSnippet` handles multiple separate highlighted segments in
      one snippet
- [ ] 3.4 Test: Clicking Search from the notes list navigates to the search page
- [ ] 3.5 Test: Typing a query triggers a search after the debounce interval
- [ ] 3.6 Test: An empty query does not trigger a search
- [ ] 3.7 Test: Rapid typing produces only one search request
- [ ] 3.8 Test: Search results show matching notes with their tags and updated time
- [ ] 3.9 Test: Matched keywords in a snippet are visually highlighted
- [ ] 3.10 Test: Before any search, an explicit prompt is shown
- [ ] 3.11 Test: A query with no matches shows an explicit no-results message
- [ ] 3.12 Test: Navigating to the next page requests the next page of search results
- [ ] 3.13 Test: Previous is disabled on the first page
- [ ] 3.14 Test: Next is disabled on the last page
- [ ] 3.15 Test: Clicking a search result navigates to that note's editor

- [ ] 3.16 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green, ≥80% coverage on new files (backend 101/101 unaffected)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1013-search-ui`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1013 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
