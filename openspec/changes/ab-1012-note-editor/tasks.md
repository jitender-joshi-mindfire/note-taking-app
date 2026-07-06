## 1. Foundation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [ ] 1.1 Create `frontend/src/lib/tiptapContent.ts` (Decision 1): `parseContent(content:
      string): JSONContent` — `JSON.parse`s the content; if that throws, or the result isn't a
      `{ type: "doc", ... }` node, wraps the raw string as a single-paragraph doc (`content`
      empty → `{ type: "doc", content: [] }`, otherwise `{ type: "doc", content: [{ type:
      "paragraph", content: [{ type: "text", text: content }] }] }`); `extractPlainText(content:
      string): string` — calls `parseContent` then recursively collects every node's `text`
      field, joined by a space; `emptyContentJson(): string` — `JSON.stringify({ type: "doc",
      content: [] })`, used as the initial content for a newly auto-created note
- [ ] 1.2 Update `frontend/src/lib/notesApi.ts`: add `createNote(input: CreateNoteInput):
      Promise<NoteSummary>` (`POST /notes`, unwraps `{ note }`) and `updateNote(id: string,
      input: UpdateNoteInput): Promise<NoteSummary>` (`PATCH /notes/:id`, unwraps `{ note }`),
      both via `authenticatedFetch`
- [ ] 1.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → 34
      frontend + 101 backend tests still green (no new tests yet)

## 2. Core Implementation

- [ ] 2.1 Create `frontend/src/pages/NoteEditorPage.tsx` (replaces `NoteDetailStubPage.tsx`,
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
      mutation if one is pending) then `navigate("/notes")`
- [ ] 2.2 Create `frontend/src/pages/NoteCreatePage.tsx` (replaces `NoteCreateStubPage.tsx`,
      Decision 4): on mount, guarded by a `useRef(false)` flag against `StrictMode`'s
      double-invoke, call `createNote({ title: "Untitled", content: emptyContentJson() })`; on
      success, `navigate(`/notes/${note.id}`, { replace: true })`; on failure, show an error
      message with a "Try again" control (re-triggers the mutation) and a link back to `/notes`
- [ ] 2.3 Update `frontend/src/pages/NotesPage.tsx`: content preview calls
      `extractPlainText(note.content)` instead of using `note.content` directly
- [ ] 2.4 Update `frontend/src/AppRoutes.tsx`: swap `/notes/:id` → `NoteEditorPage` and
      `/notes/new` → `NoteCreatePage`; delete `frontend/src/pages/NoteDetailStubPage.tsx` and
      `frontend/src/pages/NoteCreateStubPage.tsx`
- [ ] 2.5 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → still
      green. Manually smoke-test in a real browser (via the Preview tool) against the running
      backend: open an existing legacy plain-text note (from AB-1011's seeded smoke-test data)
      and confirm its text appears correctly in the editor; apply each toolbar formatting option
      and confirm it applies; type, pause, and confirm via the Preview tool's network inspector
      that exactly one `PATCH /notes/:id` fires per pause (not one per keystroke); confirm the
      save-status indicator's idle → saving → saved transitions; clear the title and confirm
      "Title is required" appears with no `PATCH` sent; retype a title and confirm autosave
      resumes; click "New note" and confirm exactly one note is created (check the notes list
      count before/after) despite `StrictMode`, and that it redirects to the new note's real id;
      click "Back to notes" mid-edit (within the debounce window) and confirm the pending save
      completes before navigating (check the notes list shows the latest edit); visit `/notes/:id`
      for another user's note (or a random uuid) and confirm not-found; confirm the notes list
      preview shows readable plain text (no JSON syntax) for a richly-formatted note; confirm
      zero browser console warnings/errors throughout

## 3. Tests (one per spec scenario)

New tests under `frontend/src/lib/tiptapContent.test.ts`, `frontend/src/pages/
NoteEditorPage.test.tsx`, and `frontend/src/pages/NoteCreatePage.test.tsx` — 11
`frontend-editor` scenarios + 1 new `frontend-notes` scenario, plus a beyond-spec unit-test file
for the `tiptapContent.ts` helpers (design.md Decision 1's legacy-plain-text fallback is the
trickiest edge case and isn't itself a top-level spec scenario, but everything else depends on
it being correct):

- [ ] 3.1 Test (beyond spec, Decision 1): `parseContent` returns valid TipTap JSON as-is
- [ ] 3.2 Test (beyond spec, Decision 1): `parseContent` wraps non-JSON plain text as a
      single-paragraph doc
- [ ] 3.3 Test (beyond spec, Decision 1): `parseContent` returns an empty doc for empty content
- [ ] 3.4 Test (beyond spec, Decision 1): `extractPlainText` returns the joined text of a
      multi-node TipTap doc with no JSON syntax visible
- [ ] 3.5 Test: Opening an existing note loads its content into the editor
- [ ] 3.6 Test: Applying formatting updates the editor content
- [ ] 3.7 Test: A pause in typing triggers a save
- [ ] 3.8 Test: Rapid successive edits produce only one save request
- [ ] 3.9 Test: Status shows "Saving..." while a save is in flight
- [ ] 3.10 Test: Status shows "Saved" after a successful save
- [ ] 3.11 Test: Status shows an error state if a save fails
- [ ] 3.12 Test: Navigating back to the notes list flushes a pending save first
- [ ] 3.13 Test: Clearing the title blocks autosave
- [ ] 3.14 Test: Visiting the editor for an inaccessible note shows not-found
- [ ] 3.15 Test: Visiting the new-note route creates a note and redirects to it
- [ ] 3.16 Test: A note with rich-text formatting shows a plain-text preview (in
      `NotesPage.test.tsx`) — also re-run the two existing `frontend-notes` scenarios ("Notes
      list renders the caller's notes", "Empty notes list shows an explicit empty state")
      unchanged to confirm the `extractPlainText` switch doesn't regress them (plain-text
      content should extract back to itself via the fallback path)

- [ ] 3.17 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green, ≥80% coverage on new files (backend 101/101 unaffected)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1012-note-editor`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1012 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
