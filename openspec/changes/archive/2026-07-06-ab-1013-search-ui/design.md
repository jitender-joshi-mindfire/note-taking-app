## Context

The backend `GET /search` endpoint (AB-1007) has no frontend consumer yet. `packages/shared`
already exports everything this ticket needs (`searchQuerySchema`, `SearchQuery`,
`SearchResultItem`, `SearchResponse`) — the wire contract doesn't change at all.

This is the first frontend ticket to debounce a *query input* rather than an *autosave*.
`NoteEditorPage.tsx` (AB-1012) established a debounce pattern, but it needed an imperative
`timerRef` + `flush()` because losing an unsaved edit is a real data-loss risk. Search has no
equivalent risk — the worst case of a "stale" debounce is just a slightly-delayed result render,
never lost data — so this ticket doesn't need to reuse that imperative machinery.

## Goals / Non-Goals

**Goals:**
- A `/search` page: debounced query input, paginated results with safely-rendered highlighted
  snippets, distinct empty/no-results states, per the `frontend-search` spec.
- A "Search" entry point link from `/notes`.

**Non-Goals:**
- Fixing the backend's `ts_headline`-on-JSON-content snippet quality (disclosed, backend-only
  follow-up — see proposal.md).
- Tag filtering on search (not supported by `GET /search`'s contract at all).
- Any change to `NotesPage.tsx` beyond adding the entry-point link.

## File Paths

**New:**
- `frontend/src/lib/searchApi.ts` — `search(query: SearchQuery): Promise<SearchResponse>` via
  `authenticatedFetch`
- `frontend/src/lib/searchSnippet.ts` — `parseSnippet(snippet: string): { text: string;
  highlighted: boolean }[]` (Decision 2)
- `frontend/src/pages/SearchPage.tsx` — the search page itself

**Modified:**
- `frontend/src/AppRoutes.tsx` — adds `/search`, wrapped in `RequireAuth` (not lazy-loaded — see
  Decision 3)
- `frontend/src/pages/NotesPage.tsx` — adds a "Search" link (Decision 4)

**No backend, no `packages/shared`, no `docs/SDS.md` changes.**

## Decisions

### Decision 1: Debounce via a derived `debouncedQuery` state + `useEffect`/`setTimeout`, not
`NoteEditorPage`'s imperative `timerRef`/`flush()` pattern
Search has no "flush before leaving" requirement (unlike autosave, there's no unsaved work to
lose) and no in-flight-overlap risk worth guarding against (TanStack Query's `queryKey` already
deduplicates/cancels stale requests when the key changes). A plain declarative debounce is
sufficient and simpler:
```
const [q, setQ] = useState("");
const [debouncedQuery, setDebouncedQuery] = useState("");
useEffect(() => {
  const timer = setTimeout(() => { setDebouncedQuery(q.trim()); setPage(1); }, 400);
  return () => clearTimeout(timer);
}, [q]);
const searchQuery = useQuery({
  queryKey: ["search", { q: debouncedQuery, page, pageSize: PAGE_SIZE }],
  queryFn: () => search({ q: debouncedQuery, page, pageSize: PAGE_SIZE }),
  enabled: debouncedQuery.length > 0,
});
```
Every keystroke resets the effect's cleanup-then-rerun cycle, so only the last keystroke's timer
survives to fire — this alone satisfies "rapid typing produces only one request." `enabled:
debouncedQuery.length > 0` satisfies "an empty query does not trigger a search" and naturally
distinguishes the before-search state (`debouncedQuery === ""`, no query has run) from the
no-results state (`searchQuery.data.items.length === 0`, a query ran and matched nothing).
**Alternative considered**: reuse `NoteEditorPage`'s `timerRef`+`flush` machinery for
consistency — rejected as needless complexity; that pattern exists specifically to solve a
data-loss problem search doesn't have.

### Decision 2: Snippets are parsed into segments and rendered as real elements, never via
`dangerouslySetInnerHTML`
The backend's snippet is a string containing `<mark>…</mark>`-wrapped matches produced by
`ts_headline` (SDS Section 6). `parseSnippet` splits on `/(<mark>.*?<\/mark>)/g`, classifying each
piece as highlighted (strip the tags, `highlighted: true`) or plain (`highlighted: false`).
`SearchPage.tsx` maps this array to `<mark>{text}</mark>` / plain text nodes. Because React
renders these as text content (never through `innerHTML`), any HTML-like characters that happen
to appear in a note's actual content (now TipTap JSON, per AB-1012) are displayed as literal
text, not interpreted as markup — this holds regardless of the known snippet-quality issue
described in proposal.md; the *content* of a highlighted/plain segment may look messy (stray `{`,
`"type"`, etc.) but it can never execute as HTML.
**Alternative considered**: `dangerouslySetInnerHTML={{ __html: snippet }}` — rejected; even
though search is scoped to the caller's own notes (not a cross-user attack surface), rendering
arbitrary string content as live HTML is avoided as a matter of practice, and the regex-split
approach costs nothing extra.

### Decision 3: `SearchPage` is not code-split via `React.lazy`
`NoteEditorPage` (AB-1012) was lazy-loaded specifically because TipTap pushed the main bundle over
Vite's 500kB chunk-size warning threshold. `SearchPage` has no comparably heavy dependency (just
TanStack Query + existing UI primitives, already in the main bundle), so eager-loading it like
`NotesPage` is consistent and simpler — confirmed by checking the production build's chunk sizes
stay under the warning threshold once this page is added (checkpoint plan, below).
**Alternative considered**: lazy-load it anyway for consistency with `NoteEditorPage` — rejected,
premature; only lazy-load when a real bundle-size problem exists, not preemptively.

### Decision 4: The "Search" link lives in `NotesPage.tsx`'s existing header row, next to
"New note"
No new layout section needed — `NotesPage.tsx` already has a header row containing the page
title and the "New note" button (AB-1011/1012); the "Search" link is added there as a second
action, matching the existing `Button asChild` + `<Link>` pattern already used for "New note."
**Alternative considered**: a global nav bar shared across all authenticated pages — rejected as
out of scope; no such shared layout/nav component exists yet in this project, and introducing one
here would be scope creep beyond what this ticket needs.

## Risks / Trade-offs

- **[Risk]** Snippets will look visibly broken (JSON-polluted) for any note with real TipTap
  content, which by now is most notes going forward. → **Mitigation**: explicitly disclosed in
  proposal.md and here, not silently accepted; flagged as a candidate backend follow-up ticket
  (fix `ts_headline`/`to_tsvector` to index extracted plain text instead of raw JSON) once this
  becomes visible to real users.
- **[Risk]** A 400ms debounce plus network latency means results lag slightly behind typing. →
  **Mitigation**: this is the standard, expected trade-off for search-as-you-type; not treated as
  a defect.
- **[Risk]** `parseSnippet`'s regex assumes well-formed, non-nested `<mark>…</mark>` pairs
  exactly as `ts_headline` produces them (SDS Section 6 confirms `StartSel=<mark>,
  StopSel=</mark>`). → **Mitigation**: if the backend ever changes this format, `parseSnippet`
  would need updating — acceptable since both live in the same monorepo and any such change would
  be a backend ticket that should account for its frontend consumer.

## Checkpoint Plan

- After foundation (`searchApi.ts`, `searchSnippet.ts`): `pnpm build` → 0 errors, `pnpm lint
  --max-warnings 0`, `pnpm test` → all still green (no new tests yet beyond `searchSnippet.ts`
  unit tests, which should already pass).
- After core implementation (`SearchPage.tsx`, route, "Search" link): `pnpm build` (confirm no
  new chunk-size warning, validating Decision 3), `pnpm lint`, `pnpm test`, plus a manual browser
  smoke test against the live backend: search for a term matching an existing note, confirm
  debounced single-request behavior via the network inspector, confirm highlighted snippet
  rendering, confirm pagination, confirm the before-search prompt and the no-results state are
  visually distinct, click a result and confirm it opens the real editor, confirm zero browser
  console warnings/errors.
- After tests (one per spec scenario, `frontend-search`): `pnpm build`, `pnpm lint
  --max-warnings 0`, `pnpm test --coverage` → all green, ≥80% coverage on new files.
