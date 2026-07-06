## 1. Foundation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [x] 1.1 Create `frontend/src/lib/versionsApi.ts` (design.md File Paths): `listVersions(noteId:
      string): Promise<NoteVersionSummary[]>` (`GET /notes/:id/versions` via
      `authenticatedFetch`, unwraps `{ items }`), `restoreVersion(noteId: string, versionId:
      string): Promise<NoteSummary>` (`POST /notes/:id/versions/:versionId/restore`, unwraps `{
      note }`) — no `getVersion`/detail-endpoint call, per Decision in proposal.md
- [x] 1.2 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → 80
      frontend + 101 backend tests still green (no new tests yet)

## 2. Core Implementation

- [x] 2.1 Create `frontend/src/components/VersionHistoryModal.tsx` (Decision 1, 2): props `{
      noteId: string; open: boolean; onClose: () => void; onRestored: (note: NoteSummary) =>
      void }`; owns `useQuery(["versions", noteId], () => listVersions(noteId), { enabled: open
      })`; local state `selectedVersionId: string | null`, `showRestoreConfirm: boolean`; renders
      the list ordered newest-first (already returned that way by the backend) with each entry's
      title + formatted timestamp; clicking an entry sets `selectedVersionId` and shows its
      content via `extractPlainText(version.content)` (Decision 2); a "Restore" button on the
      selected entry shows an inline confirmation (Requirement: Restore Confirmation) before
      calling the restore `useMutation`; `onSuccess` calls `onRestored(note)`,
      `queryClient.invalidateQueries({ queryKey: ["versions", noteId] })`, then `onClose()`
- [x] 2.2 Update `frontend/src/pages/NoteEditorPage.tsx` (Decision 3, 4): add `useQueryClient()`
      import; add a "History" button in the header next to "Share"; add local
      `isHistoryModalOpen` state; conditionally render `{isHistoryModalOpen &&
      <VersionHistoryModal noteId={id!} open={isHistoryModalOpen} onClose={() =>
      setIsHistoryModalOpen(false)} onRestored={handleRestored} />}` from the start (AB-1014
      lesson — never render a modal unconditionally); add `handleRestored(note: NoteSummary)`:
      clears `timerRef.current` if a save is pending (Decision 3), calls
      `queryClient.setQueryData(["note", id], note)` (Decision 4), `setTitle(note.title)`,
      `setTitleError(false)`, then re-applies the restored content into the editor bracketed by
      `isProgrammaticUpdate.current = true` / `editor.commands.setContent(parseContent(note
      .content))` / `isProgrammaticUpdate.current = false`, mirroring the initial-load effect
- [x] 2.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → still
      green (80 frontend + 101 backend). Manually smoke-tested in a real browser (via the Preview
      tool) against the live backend (port 3000 occupied by a stray `kubectl port-forward` again
      — used the port-4100 workaround): edited a note twice to accumulate 3 retained versions,
      opened History, confirmed the list showed newest first with title/timestamp, selected a
      version and confirmed its plain-text content preview, clicked Restore and confirmed the
      inline confirmation appeared before any request fired, confirmed it and verified the
      editor's title updated immediately without navigating away, and confirmed reopening History
      showed the pre-restore state correctly snapshotted as a new version; separately, edited the
      title, then within the 2.5s debounce window opened History and restored an older version —
      confirmed the restored title stuck and a page reload (fresh fetch from the server) showed
      the restore persisted, not the stale edit (validates design.md Decision 3's timer-clear);
      confirmed zero browser console warnings/errors throughout

## 3. Tests (one per spec scenario)

New tests under `frontend/src/components/VersionHistoryModal.test.tsx` and additions to
`frontend/src/pages/NoteEditorPage.test.tsx` — 5 `frontend-version-history` scenarios:

- [x] 3.1 Test: Clicking History opens the version history view for the current note
      (`NoteEditorPage.test.tsx`)
- [x] 3.2 Test: Versions are listed newest first, each showing title and timestamp
      (`VersionHistoryModal.test.tsx`)
- [x] 3.3 Test: Selecting a version shows its title and content as plain text
      (`VersionHistoryModal.test.tsx`)
- [x] 3.4 Test: Restoring requires confirmation before the request fires
      (`VersionHistoryModal.test.tsx`)
- [x] 3.5 Test: Confirming restore updates the note's live title and content in the editor
      (`NoteEditorPage.test.tsx`)
- [x] 3.5b Test (beyond spec): Cancelling the restore confirmation returns to the version
      preview without calling restore (`VersionHistoryModal.test.tsx`)
- [x] 3.6 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green (86 frontend + 101 backend tests), `VersionHistoryModal.tsx` at
      95.65% coverage (`versionsApi.ts` at 0% matches the established pattern for thin API-wrapper
      files — `shareApi.ts`/`searchApi.ts` are also 0%, exercised only via mocks, not directly
      unit-tested — this is not a regression)

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1015-version-history-ui`
- [x] 4.2 Update `docs/TICKETS.md` AB-1015 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)

## 5. Post-archive review fix

- [x] 5.1 The fresh-context reviewer sub-agent run before `/pr` confirmed all 5 spec scenarios,
      design.md Decisions 3/4, and conditional mounting were correctly implemented (verdict:
      PASS) but flagged one test-coverage gap: `handleRestored`'s `timerRef.current` clear
      (design.md Decision 3 — the mitigation for a pending, not-yet-fired autosave silently
      firing after a restore) had no automated regression test, only the manual browser smoke
      test from 2.3. Added "Restoring a version clears a pending autosave so it can't overwrite
      the restored content afterward (beyond spec)" to `NoteEditorPage.test.tsx`: schedules an
      autosave via a title edit, restores an older version before the debounce fires, then
      advances fake timers well past the original debounce window and asserts `updateNote` was
      never called — this would fail if the timer-clear were ever accidentally removed. Re-ran
      the full checkpoint after the fix: build/lint clean, 87/87 frontend + 101/101 backend tests
      green, `NoteEditorPage.tsx` coverage improved to 93.06%.
