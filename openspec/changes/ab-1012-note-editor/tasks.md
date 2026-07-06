## 1. Foundation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [x] 1.1 Create `frontend/src/lib/tiptapContent.ts` (Decision 1): `parseContent(content:
      string): JSONContent` — `JSON.parse`s the content; if that throws, or the result isn't a
      `{ type: "doc", ... }` node, wraps the raw string as a single-paragraph doc (`content`
      empty → `{ type: "doc", content: [] }`, otherwise `{ type: "doc", content: [{ type:
      "paragraph", content: [{ type: "text", text: content }] }] }`); `extractPlainText(content:
      string): string` — calls `parseContent` then recursively collects every node's `text`
      field, joined by a space; `emptyContentJson(): string` — `JSON.stringify({ type: "doc",
      content: [] })`, used as the initial content for a newly auto-created note
- [x] 1.2 Update `frontend/src/lib/notesApi.ts`: add `createNote(input: CreateNoteInput):
      Promise<NoteSummary>` (`POST /notes`, unwraps `{ note }`) and `updateNote(id: string,
      input: UpdateNoteInput): Promise<NoteSummary>` (`PATCH /notes/:id`, unwraps `{ note }`),
      both via `authenticatedFetch`
- [x] 1.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → 34
      frontend + 101 backend tests still green (no new tests yet)

## 2. Core Implementation

- [x] 2.1 Create `frontend/src/pages/NoteEditorPage.tsx` (replaces `NoteDetailStubPage.tsx`,
      Decision 6): reuse the existing `useQuery(["note", id], () => getNote(id!))` + 404-retry
      suppression pattern unchanged; once loaded, initialize a TipTap `useEditor({ extensions:
      [StarterKit], content: parseContent(note.content) })` and a plain title `<input>`
      pre-filled from `note.title`; a toolbar with Bold/Italic/H1/H2/bullet-list/numbered-list
      buttons calling `editor.chain().focus().toggleX().run()`, each reflecting active state via
      `editor.isActive("x")`; on any title or editor `onUpdate` change, (re)start a ~2-3s debounce
      timer (Decision 3, a `useRef` timer + a `flush()` function) that calls `updateNote(id, {
      title, content: JSON.stringify(editor.getJSON()) })` (Decision 2 — always both fields
      together) unless the title is empty (Decision 5 — show "Title is required" instead of
      saving, no PATCH sent); track and render save-status (idle/saving/saved/error) from the
      `useMutation`'s state; not-found state (`ApiError` with `status === 404`) shows a not-found
      message instead of the editor; a "Back to notes" control calls `flush()` (awaiting the
      mutation if one is pending) then `navigate("/notes")`. **Bug found during smoke testing**:
      the initial `editor.commands.setContent(...)` call in the load effect itself fired
      `onUpdate`, scheduling (and eventually sending) an unwanted autosave merely from opening a
      note, before the user typed anything. Fixed with an `isProgrammaticUpdate` ref that brackets
      the programmatic `setContent` call so `onUpdate` ignores it, only reacting to real user edits.
- [x] 2.2 Create `frontend/src/pages/NoteCreatePage.tsx` (replaces `NoteCreateStubPage.tsx`,
      Decision 4): on mount, guarded by a `useRef(false)` flag against `StrictMode`'s
      double-invoke, call `createNote({ title: "Untitled", content: emptyContentJson() })`; on
      success, `navigate(`/notes/${note.id}`, { replace: true })`; on failure, show an error
      message with a "Try again" control (re-triggers the mutation) and a link back to `/notes`
- [x] 2.3 Update `frontend/src/pages/NotesPage.tsx`: content preview calls
      `extractPlainText(note.content)` instead of using `note.content` directly
- [x] 2.4 Update `frontend/src/AppRoutes.tsx`: swap `/notes/:id` → `NoteEditorPage` (lazy-loaded
      via `React.lazy`/`Suspense`, added after the build initially flagged a >500kB chunk-size
      warning from TipTap's bundle weight — not in the original design, but a direct, in-scope
      consequence of this ticket's own dependency, so fixed rather than left as a build warning)
      and `/notes/new` → `NoteCreatePage`; delete `frontend/src/pages/NoteDetailStubPage.tsx` and
      `frontend/src/pages/NoteCreateStubPage.tsx`; removed the two now-obsolete
      `frontend-notes` "Note Navigation Stubs" tests from `NotesPage.test.tsx` (their replacement
      coverage lives in the new `frontend-editor` test files, Phase 3)
- [x] 2.5 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → still
      green. Manually smoke-tested in a real browser (via the Preview tool) against the real
      backend (port 3000 occupied by a stray `kubectl port-forward` again — reused the still-running
      port-4100 backend instance from AB-1011's session): opened an existing legacy plain-text
      note and confirmed its text appears correctly in the editor (Decision 1's fallback);
      applied Bold formatting and confirmed both the rendered `<strong>` markup and the toolbar's
      active-state styling; typed and confirmed via the Preview tool's network inspector that
      exactly one `PATCH /notes/:id` fired after the debounce, and confirmed zero `PATCH` calls
      from merely opening a note (this is what surfaced the bug fixed in 2.1); confirmed the
      save-status indicator showed "Saved"; cleared the title and confirmed "Title is required"
      with no `PATCH` sent, then restored it; clicked "Back to notes" immediately after retyping
      the title (within the debounce window) and confirmed the rename appeared in the list
      instantly, proving the flush fired; clicked "New note" and confirmed via a direct API call
      that exactly one "Untitled" note was created (total count 25→26) despite `StrictMode`, and
      that it redirected to the new note's real id; visited `/notes/:id` for a random uuid and
      confirmed "Note not found."; confirmed the notes list preview shows readable plain text
      (no JSON syntax) throughout; confirmed zero browser console errors/warnings across the
      entire session

## 3. Tests (one per spec scenario)

New tests under `frontend/src/lib/tiptapContent.test.ts`, `frontend/src/pages/
NoteEditorPage.test.tsx`, and `frontend/src/pages/NoteCreatePage.test.tsx` — 11
`frontend-editor` scenarios + 1 new `frontend-notes` scenario, plus a beyond-spec unit-test file
for the `tiptapContent.ts` helpers (design.md Decision 1's legacy-plain-text fallback is the
trickiest edge case and isn't itself a top-level spec scenario, but everything else depends on
it being correct):

- [x] 3.1 Test (beyond spec, Decision 1): `parseContent` returns valid TipTap JSON as-is
- [x] 3.2 Test (beyond spec, Decision 1): `parseContent` wraps non-JSON plain text as a
      single-paragraph doc
- [x] 3.3 Test (beyond spec, Decision 1): `parseContent` returns an empty doc for empty content
- [x] 3.4 Test (beyond spec, Decision 1): `extractPlainText` returns the joined text of a
      multi-node TipTap doc with no JSON syntax visible
- [x] 3.5 Test: Opening an existing note loads its content into the editor
- [x] 3.6 Test: Applying formatting updates the editor content
- [x] 3.7 Test: A pause in typing triggers a save
- [x] 3.8 Test: Rapid successive edits produce only one save request
- [x] 3.9 Test: Status shows "Saving..." while a save is in flight
- [x] 3.10 Test: Status shows "Saved" after a successful save
- [x] 3.11 Test: Status shows an error state if a save fails
- [x] 3.12 Test: Navigating back to the notes list flushes a pending save first
- [x] 3.13 Test: Clearing the title blocks autosave
- [x] 3.14 Test: Visiting the editor for an inaccessible note shows not-found
- [x] 3.15 Test: Visiting the new-note route creates a note and redirects to it
- [x] 3.16 Test: A note with rich-text formatting shows a plain-text preview (in
      `NotesPage.test.tsx`) — also re-run the two existing `frontend-notes` scenarios ("Notes
      list renders the caller's notes", "Empty notes list shows an explicit empty state")
      unchanged to confirm the `extractPlainText` switch doesn't regress them (plain-text
      content should extract back to itself via the fallback path)

- [x] 3.17 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green, ≥80% coverage on new files (backend 101/101 unaffected)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1012-note-editor`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1012 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
