## Context

AB-1011 left `/notes/:id` (`NoteDetailStubPage.tsx`) and `/notes/new` (`NoteCreateStubPage.tsx`)
as minimal, explicitly-temporary placeholders — both proposal.md and their own in-app text say
"editing arrives in AB-1012." `@tiptap/react` and `@tiptap/starter-kit` are already installed
(`frontend/package.json`) per the project's fixed tech stack, but nothing in the codebase uses
them yet — this is the first ticket to actually wire up TipTap.

**Context7 unavailability**: Context7 MCP was not available in this session (checked via
`ToolSearch`, no matching server found), so TipTap's `useEditor`/`EditorContent`/`StarterKit`
API surface used below is from established knowledge, not live-doc-verified as `CLAUDE.md`'s
Library Verification rule prefers. Mitigation, per the same pattern AB-1010 used for its own
Context7 gap: a manual browser smoke test (task 2.6) exercises every editor interaction —
loading content, typing, applying each toolbar formatting option, autosave firing, save-status
transitions, and the not-found path — before this ticket is considered done.

`packages/shared`'s `content: z.string()` has no format constraint and was never given one — it
was already an unconstrained string in AB-1004's original schema. This ticket doesn't change the
wire contract at all, only what convention the frontend uses for that string's contents.

## Goals / Non-Goals

**Goals:**
- Replace both stub pages with a working TipTap editor, debounced autosave, and new-note
  auto-creation, per the `frontend-editor` spec.
- Keep `NotesPage.tsx`'s list preview readable once notes contain real TipTap JSON.
- Handle already-existing notes in the dev database whose `content` is plain text (created via
  `curl` during AB-1011's smoke testing, or any note created before this ticket) without
  crashing or losing that content.

**Non-Goals:**
- Fixing `ts_headline`'s search-snippet quality against JSON content (backend, AB-1007, already
  shipped — out of scope here, disclosed in proposal.md).
- Note deletion, tag editing from the editor, sharing, or version history UI (other tickets or,
  for deletion, no ticket yet).
- `beforeunload`/tab-close/browser-back handling for a pending autosave (proposal.md explicitly
  scopes flush-on-navigate to the in-app "Back to notes" control only).

## File Paths

**New:**
- `frontend/src/lib/tiptapContent.ts` — `parseContent(content: string): JSONContent`,
  `extractPlainText(content: string): string`, `emptyContentJson(): string` (see Decision 1)
- `frontend/src/pages/NoteEditorPage.tsx` — replaces `NoteDetailStubPage.tsx`; the real editor
  for an existing note at `/notes/:id`
- `frontend/src/pages/NoteCreatePage.tsx` — replaces `NoteCreateStubPage.tsx`; fires the
  auto-create mutation on mount and redirects (see Decision 4)

**Modified:**
- `frontend/src/lib/notesApi.ts` — adds `createNote(input: CreateNoteInput): Promise<NoteSummary>`
  and `updateNote(id: string, input: UpdateNoteInput): Promise<NoteSummary>`, both via
  `authenticatedFetch`, both unwrapping `{ note }` like `getNote` already does
  (`POST /notes` → `201 { note }`, `PATCH /notes/:id` → `200 { note }`, per SDS Section 5)
- `frontend/src/pages/NotesPage.tsx` — content preview calls `extractPlainText(note.content)`
  instead of using `note.content` directly; no other change
- `frontend/src/AppRoutes.tsx` — swaps the two stub page imports/elements for the two new pages

**Removed:**
- `frontend/src/pages/NoteDetailStubPage.tsx`, `frontend/src/pages/NoteCreateStubPage.tsx`
  (superseded)

**No backend, no `packages/shared`, no `docs/SDS.md` changes.**

## Decisions

### Decision 1: A single `parseContent` helper handles both real TipTap JSON and legacy plain text
Notes created before this ticket (including the 25+ notes seeded via direct `curl` calls during
AB-1011's manual smoke test, still sitting in the dev database) have plain-text `content`, not
JSON. `parseContent` tries `JSON.parse`; if that throws, or the result isn't a TipTap doc node
(`{ type: "doc", ... }`), it wraps the raw string as a single-paragraph doc
(`{ type: "doc", content: content ? [{ type: "paragraph", content: [{ type: "text", text:
content }] }] : [] }`) instead of discarding it. Both the editor's initial `content:` prop and
`extractPlainText` (used by both the editor's own logic, if needed, and `NotesPage.tsx`'s
preview) go through this one function, so the fallback logic exists in exactly one place.
**Alternative considered**: treat any non-JSON content as empty/broken — rejected, this would
silently blank out real content the moment a pre-existing note is opened in the new editor,
which is a data-loss bug, not an acceptable migration story.

### Decision 2: The debounced-autosave PATCH always sends both `title` and `content` together
Rather than tracking which of the two fields is "dirty" and sending only that one,
the debounce/flush function always sends `{ title, content }` as the current, authoritative
values held in the editor's local state. `updateNoteSchema` accepts both as optional and applies
whichever are present — sending both every time is valid and semantically identical to sending
only the changed one, since the "unchanged" field's value being resent is exactly what the
backend already has. This avoids a second piece of state (per-field dirty flags) for no
behavioral benefit.
**Alternative considered**: per-field dirty tracking, sending only the changed field — rejected
as unnecessary complexity; the coalesced-into-one-request behavior the spec asks for doesn't
require it.

### Decision 3: Debounce and flush logic lives inline in `NoteEditorPage.tsx`, not a shared hook
`frontend/CLAUDE.md`'s existing patterns (`NotesPage.tsx`'s local `useState` for
page/sort/tagIds, per AB-1011 Decision 6) already favor component-local state over new
abstractions when there's exactly one consumer. The debounce timer (`useRef<ReturnType<typeof
setTimeout> | null>`) and a `flush()` function (clears the timer, and if there's a pending
change, calls the update mutation immediately) are the only pieces of state this needs, and only
`NoteEditorPage.tsx` will ever use them.
**Alternative considered**: a reusable `useDebouncedAutosave` hook — rejected as premature
abstraction; nothing else in this ticket or the remaining roadmap (AB-1013–1015) needs a second
debounced-save consumer.

### Decision 4: `/notes/new` auto-creation guards against React `StrictMode`'s double-invoke
`main.tsx` wraps the app in `<StrictMode>`, which intentionally double-invokes effects in
development to surface side-effect bugs. A naive `useEffect(() => { createNote(...) }, [])` on
`NoteCreatePage` would fire the create mutation twice, producing two "Untitled" notes. A
`useRef(false)` guard (`hasCreated.current`) ensures the mutation is only triggered once
regardless of how many times the effect runs. On success, `navigate(`/notes/${note.id}`, {
replace: true })` — `replace` so the browser's back button from the editor returns to `/notes`,
not back to `/notes/new` (which would create yet another note).
**Alternative considered**: trigger creation from a button click instead of on mount (avoiding
the StrictMode issue entirely) — rejected, this contradicts the spec's own scenario ("WHEN an
authenticated user navigates to `/notes/new` THEN the system creates a note... and navigates"),
which requires creation to happen automatically on navigation, not gated behind an extra click.

### Decision 5: The "Title is required" message is separate from the generic save-status indicator
The save-status indicator (idle/saving/saved/error) reflects the autosave *mutation's* state.
Withholding a save because the title is empty is a client-side validation gate, not a failed
network request — conflating the two would show a generic "error" for a case that isn't really
an error, just an incomplete field. A separate inline message near the title input handles this
case; the save-status indicator stays in whatever state it was last in (or "idle" if no save has
happened yet) while the title is empty.
**Alternative considered**: route the empty-title case through the same error state as a failed
PATCH — rejected, conflates two different situations a user would want to distinguish (my
internet/the server is having trouble vs. I need to type a title).

### Decision 6: The editor always fetches by id via `getNote`, matching the stub's existing pattern
`NoteEditorPage.tsx` reuses `NoteDetailStubPage.tsx`'s exact `useQuery(["note", id], () =>
getNote(id!))` + 404-retry-suppression pattern (AB-1011) unchanged, then feeds
`parseContent(noteQuery.data.content)` into TipTap's `content:` option once the query resolves.
No new fetching pattern needed.

## Risks / Trade-offs

- **[Risk]** Autosave firing every ~2-3s of typing pauses will consume much of the backend's
  50-version retention cap (SDS Section 8) during a single active editing session, making
  version history (AB-1015) show recent autosave noise rather than meaningful milestones. →
  **Mitigation**: none in this ticket — this is a backend behavior (already shipped, AB-1009)
  this ticket cannot change without a backend ticket of its own. Disclosed in proposal.md and
  here rather than silently accepted; flagged as a candidate follow-up ticket (e.g. "only
  version-snapshot on a longer idle threshold, or on explicit save," a backend change) if it
  proves to be a real usability problem once AB-1015 ships.
- **[Risk]** Context7 wasn't available to verify the TipTap v3 API surface live. → **Mitigation**:
  manual browser smoke test covering every editor interaction before sign-off (task 2.6); if any
  API call turns out wrong, it will surface immediately as a broken toolbar button or a crash,
  not a silent behavioral gap.
- **[Risk]** Legacy plain-text notes (pre-existing dev data) get wrapped as a single paragraph on
  first open — this is a one-way, lossless *display* transformation (the original text is fully
  preserved as the paragraph's text), but the very next autosave will persist that note as real
  TipTap JSON, permanently changing its `content` format. → **Mitigation**: this is the intended
  migration path (lazy, on-touch), not a bug; no batch migration script is needed since nothing
  else depends on the old plain-text convention once `parseContent`/`extractPlainText` exist.
- **[Risk]** `NoteCreatePage`'s auto-create could fail (network error, validation edge case). →
  **Mitigation**: an error state with a "Try again" control that re-triggers the create mutation,
  and a link back to `/notes`.

## Checkpoint Plan

- After foundation (`tiptapContent.ts`, `notesApi.ts` additions): `pnpm build` → 0 errors, `pnpm
  lint --max-warnings 0`, `pnpm test` → all still green (no new tests yet at this point beyond
  `tiptapContent.ts` unit tests, which should already be passing).
- After core implementation (`NoteEditorPage.tsx`, `NoteCreatePage.tsx`, routes): `pnpm build`,
  `pnpm lint`, `pnpm test`, plus a manual browser smoke test against the live backend: open an
  existing (legacy plain-text) note and confirm its text appears correctly in the editor; open a
  note created via this ticket's own flow; apply each toolbar formatting option; type, pause, and
  confirm exactly one `PATCH` fires (via the Preview tool's network inspector); confirm the
  save-status indicator's idle → saving → saved transitions; clear the title and confirm the
  "Title is required" message with no `PATCH` sent; click "New note" and confirm auto-creation +
  redirect + no duplicate note under React's `StrictMode`; click "Back to notes" mid-edit and
  confirm the pending save flushes before navigating; visit `/notes/:id` for another user's note
  (or a random uuid) and confirm not-found; confirm the notes list preview shows plain text for
  a richly-formatted note; confirm zero browser console warnings/errors throughout.
- After tests (one per spec scenario, `frontend-editor` + the `frontend-notes` delta): `pnpm
  build`, `pnpm lint --max-warnings 0`, `pnpm test --coverage` → all green, ≥80% coverage on new
  files.
