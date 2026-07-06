## Why

FRS 4.1 (Create) and 4.3 (Update) are fully implemented on the backend (AB-1004) but the frontend
has no way to actually write a note yet — AB-1011 left `/notes/:id` and `/notes/new` as
read-only/static stub pages, explicitly reserved for this ticket to replace. This ticket builds
the real TipTap-based editor with debounced autosave, so a user can actually create and edit
notes.

## What Changes

- **Rich text editor** (`/notes/:id`, FRS 4.1.1/4.3.1): a TipTap editor (StarterKit toolbar —
  bold, italic, H1/H2, bullet and numbered lists) for a note's title and content, replacing
  `NoteDetailStubPage`'s read-only preview.
- **Content storage format** (decided during `/spec`): the editor's content is stored as
  `JSON.stringify(editor.getJSON())` in the existing `content: string` field — an opaque JSON
  blob, per `frontend/CLAUDE.md`'s existing instruction ("do not parse or transform it outside
  the editor layer"). No backend or shared-schema change; `content` was already an unconstrained
  string.
- **Plain-text preview helper** (decided during `/spec`, **MODIFIED** `frontend-notes`
  capability): since `content` is no longer human-readable raw text once real rich content
  exists, `NotesPage.tsx`'s list preview is updated to extract and show plain text from the
  TipTap JSON rather than the raw string. This only touches the list preview; it does not fix
  search snippet quality (`ts_headline` on raw JSON, AB-1007, backend-only) — that is a disclosed,
  out-of-scope follow-up, not silently ignored.
- **Debounced autosave** (FRS 4.3.1, decided during `/spec`): edits to title or content save via
  `PATCH /notes/:id` ~2-3 seconds after the user stops typing, coalescing rapid keystrokes into
  one request. This is in tension with the backend's per-update version snapshot + 50-version
  retention cap (SDS Section 8) — an active editing session will consume much of that budget on
  incremental autosaves rather than meaningful checkpoints. This is a known, disclosed limitation
  (see design.md), not something this ticket can fix (the retention/versioning behavior is
  backend, already shipped in AB-1009).
- **New-note auto-creation** (decided during `/spec`): visiting `/notes/new` immediately
  `POST /notes` with `title: "Untitled"` and empty content, then navigates to `/notes/:id` with
  the real id — reconciling the backend's non-empty-title requirement with an editor that starts
  blank. Replaces `NoteCreateStubPage`'s static placeholder.
- **Save status indicator** (decided during `/spec`): a text indicator reflecting the autosave
  mutation's state (idle/saving/saved/error). No separate manual "Save" button — autosave is the
  only save mechanism.
- **Flush-on-navigate** (decided during `/spec`): clicking "Back to notes" flushes any pending
  debounced save before navigating away. Browser back/tab-close are explicitly not handled (no
  `beforeunload` confirmation dialog in this ticket) — a narrow, disclosed risk of losing the
  last few seconds of typing in those cases.
- **Empty-title guard** (client-side, mirroring the Zod-validation pattern from AB-1010's forms):
  if the title is cleared to empty, autosave does not fire (avoiding a guaranteed 400 from the
  backend's `updateNoteSchema`) and a "Title is required" message shows instead.
- **`/notes/:id` not-found handling carries over** from the AB-1011 stub (unowned/nonexistent
  note id still shows a not-found state) — now on the real editor page instead of the stub.
- **Out of scope for this ticket**: note deletion (FRS 4.4 — not assigned to any ticket in
  `docs/TICKETS.md` yet), tag editing from within the editor (tags remain list-page-only, per
  AB-1011), search (AB-1013), sharing (AB-1014), version history UI (AB-1015).

## Capabilities

### New Capabilities
- `frontend-editor`: the TipTap rich-text editor, debounced autosave, new-note auto-creation,
  save-status indicator, flush-on-navigate, and not-found handling at `/notes/:id` and
  `/notes/new`, per FRS 4.1, 4.3.

### Modified Capabilities
- `frontend-notes`: the "Notes List Display" requirement is modified so the content preview is
  plain text extracted from TipTap JSON, not raw content. The "Note Navigation Stubs"
  requirement is removed — it explicitly described temporary placeholder behavior reserved for
  this ticket to replace; its real behavior now lives in the new `frontend-editor` capability.

## Impact

- **New frontend code**: `frontend/src/pages/NoteEditorPage.tsx` (replaces
  `NoteDetailStubPage.tsx`); a new-note creation flow replacing `NoteCreateStubPage.tsx`;
  `frontend/src/lib/notesApi.ts` gains `createNote`/`updateNote`; a plain-text-from-TipTap-JSON
  helper (used by both the editor and `NotesPage.tsx`'s preview).
- **Modified frontend code**: `frontend/src/pages/NotesPage.tsx` (preview extraction only, no
  other change); `frontend/src/AppRoutes.tsx` (swaps stub pages for the real editor/create flow).
- **No new dependency** — `@tiptap/react` and `@tiptap/starter-kit` are already installed
  (`frontend/package.json`), per the project's fixed tech stack.
- **No backend changes** — consumes the existing `POST /notes` and `PATCH /notes/:id` endpoints
  exactly as documented (SDS Section 5).
- **No changes to `packages/shared`** — reuses `createNoteSchema`/`updateNoteSchema`/
  `CreateNoteInput`/`UpdateNoteInput`/`NoteSummary` as-is; `content` remains an unconstrained
  string, no new type needed for the TipTap JSON shape (TipTap's own `JSONContent` type from
  `@tiptap/react` is used directly in the frontend, not added to `packages/shared`, since the
  backend never inspects its structure).
- **No changes to `docs/SDS.md`** — no new API contract, status code, or DB field.
