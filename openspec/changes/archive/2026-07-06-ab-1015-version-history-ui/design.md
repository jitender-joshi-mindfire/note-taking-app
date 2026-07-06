## Context

The backend's version-history endpoints (AB-1009) have no frontend consumer yet.
`VersionService.ts`'s `listVersions` returns full `NoteVersionSummary[]` (including `content`)
for every item — there is no separate lightweight list shape — so the frontend never needs to
call `GET /notes/:id/versions/:versionId` at all; the list response already has everything
needed to preview any version.

`NoteEditorPage.tsx` (AB-1012) loads a note's title/content into the TipTap editor exactly once
on mount, guarded by `hasInitialized`/`isProgrammaticUpdate` refs, specifically so a background
query refetch never clobbers in-progress typing. A successful restore needs to deliberately
bypass that guard to show the restored content — this is the same integration point AB-1014's
`ShareModal` never needed to touch, since sharing doesn't change a note's title/content.

## Goals / Non-Goals

**Goals:**
- A "History" button + modal listing a note's versions, viewing one's content, and restoring
  with confirmation, per the `frontend-version-history` spec.
- Correctly sync the restored content into the already-mounted editor and its query cache.

**Non-Goals:**
- A literal slide-in side panel (the ticket's "drawer" wording is treated as informal — see
  proposal.md).
- Calling the single-version detail endpoint (`GET /notes/:id/versions/:versionId`) — redundant
  given the list already returns full content.
- A rich read-only rendering of a version's content (plain-text extraction is enough for a
  preview; see Decision 2).
- Handling an already-in-flight autosave request racing a concurrent restore at the network
  layer (see Risks — a narrow, disclosed edge case, not fixed here).

## File Paths

**New:**
- `frontend/src/lib/versionsApi.ts` — `listVersions(noteId: string):
  Promise<NoteVersionSummary[]>` (`GET /notes/:id/versions`, unwraps `{ items }`),
  `restoreVersion(noteId: string, versionId: string): Promise<NoteSummary>` (`POST
  /notes/:id/versions/:versionId/restore`, unwraps `{ note }`)
- `frontend/src/components/VersionHistoryModal.tsx` — self-contained: owns its own
  `useQuery(["versions", noteId], ...)` and restore `useMutation` (matching `ShareModal`'s
  ownership pattern), plus local `selectedVersionId`/`showRestoreConfirm` state

**Modified:**
- `frontend/src/pages/NoteEditorPage.tsx` — adds a "History" button next to "Share"; a
  conditionally-mounted `<VersionHistoryModal>` (`{isHistoryModalOpen && <VersionHistoryModal
  ... />}` from the start — applying AB-1014's post-archive review-fix lesson directly, not
  repeating that mistake); a `handleRestored(note: NoteSummary)` callback (Decision 1, 3)

**No backend, no `packages/shared`, no `docs/SDS.md` changes.**

## Decisions

### Decision 1: `VersionHistoryModal` owns its restore mutation; `NoteEditorPage` only handles
syncing the result into the editor
`VersionHistoryModal` receives `{ noteId, open, onClose, onRestored: (note: NoteSummary) => void
}`. It fetches the version list itself, lets the user select and preview a version, shows the
restore confirmation, and calls the restore mutation itself. On success, it calls
`onRestored(note)` (the fresh `NoteSummary` the endpoint returns) and `onClose()`. This mirrors
`ShareModal`'s self-contained-mutation ownership exactly — `NoteEditorPage` doesn't need to know
anything about versions beyond "here's the freshly-restored note, please display it."
**Alternative considered**: have `NoteEditorPage` own the restore mutation, with the modal only
reporting "user picked this version id" — rejected, this would break the established pattern
(every other modal in this app owns its own mutations) for no benefit.

### Decision 2: Version content preview uses `extractPlainText`, not a second read-only TipTap
instance
Mounting a second TipTap editor instance (even a read-only one) just to preview one version's
content at a time is disproportionate for this ticket — the same `extractPlainText` helper
already used by `NotesPage`'s list preview and `SearchPage`'s results does the job with zero new
code.
**Alternative considered**: a real read-only `EditorContent` bound to a fresh `useEditor` with
`editable: false` — rejected as unnecessary weight for a version preview panel; nothing in the
spec requires rich rendering here.

### Decision 3: Restoring clears any pending (not-yet-fired) autosave timer; an already-in-flight
save at the exact moment of restore is a disclosed, accepted risk
`handleRestored` clears `NoteEditorPage`'s `timerRef` (if a debounced autosave is scheduled but
hasn't fired yet) before applying the restored title/content, so that a stale pre-restore save
can't fire moments later and silently overwrite the just-restored note. This is the common case:
a user with unsaved edits opens history and restores — without this, the autosave timer (already
running, capturing the OLD title/content via `titleRef`/`editor.getJSON()` at *fire* time, not
*schedule* time) could send a `PATCH` shortly after the restore's `POST` completes, and whichever
write lands last in the database wins — undoing the restore. Clearing the timer removes this race
for the realistic case. An autosave request that's already *mid-flight* (past the debounce, HTTP
request already sent) when a restore completes cannot be cancelled without introducing
`AbortController` plumbing this codebase doesn't otherwise use anywhere — this exact overlap
window is narrow (requires a save in flight AND a restore completing within that same window) and
is disclosed as an accepted risk rather than fixed here.
**Alternative considered**: `AbortController`-based cancellation of any in-flight save on
restore — rejected as disproportionate; the timer-clear alone handles the realistic case, and a
full cancellation mechanism would be new infrastructure introduced for an edge case this narrow.

### Decision 4: The restored note is written directly into the `["note", id]` query cache via
`queryClient.setQueryData`, not `invalidateQueries`
Unlike `ShareModal`'s `invalidateQueries` (which triggers a background refetch because the
mutation's own response doesn't include everything the note-detail view needs — e.g., it's just
`{ token, url, expiresAt }`, not a full note), the restore endpoint's response IS the complete,
authoritative fresh `NoteSummary`. Writing it directly into the cache is strictly more correct
(no unnecessary network round-trip) and avoids any window where the cache is briefly stale before
a refetch completes.
**Alternative considered**: `invalidateQueries` like `ShareModal` does — rejected, that pattern
exists specifically because a share-link mutation's response is a different, smaller shape than
the note object; here the restore response already *is* the note object, so writing it directly
is both correct and simpler.

## Risks / Trade-offs

- **[Risk]** An autosave request already in flight (HTTP request sent, response not yet
  received) at the exact moment a restore completes could still overwrite the restored content if
  its response arrives after the restore's. → **Mitigation**: disclosed above (Decision 3) as an
  accepted, narrow risk; the common case (a merely-scheduled, not-yet-fired autosave) is handled.
  Revisit with `AbortController`-based cancellation if this proves to be a real problem in
  practice.
- **[Risk]** Version content preview loses formatting (shown as plain text via
  `extractPlainText`), so a restored version's rich formatting isn't visible until after
  restoring. → **Mitigation**: disclosed as a deliberate scope trade-off (Decision 2); the
  restored content's actual formatting is fully preserved server-side regardless — only the
  *preview* is plain text, restoring re-applies the real TipTap JSON via the editor.

## Checkpoint Plan

- After foundation (`versionsApi.ts`): `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
  `pnpm test` → all still green (no new tests yet).
- After core implementation (`VersionHistoryModal.tsx`, `NoteEditorPage.tsx` wiring): `pnpm
  build`, `pnpm lint`, `pnpm test`, plus a manual browser smoke test against the live backend:
  edit a note a few times to accumulate versions, open History, confirm versions list newest
  first with title/timestamp, select a version and confirm its plain-text content preview, click
  Restore and confirm the inline confirmation appears, confirm it and verify the editor's title
  and content update immediately to the restored version without navigating away; make an edit,
  wait less than the debounce interval, open History and restore a version, confirm the
  restored content sticks (the pending autosave doesn't silently overwrite it — validates
  Decision 3); confirm zero browser console warnings/errors.
- After tests (one per spec scenario, `frontend-version-history`): `pnpm build`, `pnpm lint
  --max-warnings 0`, `pnpm test --coverage` → all green, ≥80% coverage on new files.
