## 1. Foundation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [x] 1.1 Create `frontend/src/components/ui/dialog.tsx` (Decision 2): `Dialog({ open, onClose,
      children })` — renders nothing when `!open`; otherwise an overlay `<div>` (click calls
      `onClose`) containing a panel `<div>` (click stops propagation); a `useEffect` `keydown`
      listener calls `onClose` on `Escape` while open
- [x] 1.2 Create `frontend/src/lib/shareApi.ts`: `generateShareLink(noteId: string, input:
      GenerateShareLinkInput): Promise<ShareLinkSummary>` (`POST /notes/:id/share`),
      `revokeShareLink(noteId: string): Promise<void>` (`DELETE /notes/:id/share`), both via
      `authenticatedFetch`
- [x] 1.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → 65
      frontend + 101 backend tests still green (no new tests yet)

## 2. Core Implementation

- [ ] 2.1 Create `frontend/src/components/ShareModal.tsx` (Decision 1, 3, 4): local state for
      `expiresInDays: 7 | 30 | 90` (default 7, rendered as three toggle buttons per Decision 3),
      `showRegenerateConfirm`/`showRevokeConfirm` booleans (Decision 4), `copied` (transient,
      reset after a short timeout), `justGenerated: ShareLinkSummary | null`, `justRevoked:
      boolean`; a `useQueryClient()` + `useMutation` for generate and one for revoke, each
      invalidating `["note", note.id]` in `onSuccess` (Decision 1); renders the no-active-link
      expiry-selection UI when neither `note.shareLink` nor `justGenerated` is present and
      `justRevoked` is false; renders the active-link URL/expiry/view-count plus a "Copy" button
      (using `navigator.clipboard.writeText`) and a "Revoke" button otherwise; clicking
      "Generate" shows the regenerate confirmation first only if an active link already exists
      (Decision 4), otherwise generates immediately
- [ ] 2.2 Update `frontend/src/pages/NoteEditorPage.tsx`: add a "Share" button in the header row
      next to "Back to notes"; add local `isShareModalOpen` state; conditionally render
      `<ShareModal note={noteQuery.data} open={isShareModalOpen} onClose={() =>
      setIsShareModalOpen(false)} />`
- [ ] 2.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → still
      green. Manually smoke-test in a real browser (via the Preview tool) against the running
      backend: open a note with no active link, click "Share", generate a link with each expiry
      preset and confirm the URL/expiry/view-count-0 appear immediately; click "Copy" and paste
      elsewhere to confirm the real clipboard received the URL, and confirm the button shows
      "Copied!"; click "Generate" again on a note that now has an active link and confirm the
      regenerate confirmation appears before it's replaced; click "Revoke" and confirm the revoke
      confirmation appears before the link disappears, then confirm the modal shows the
      no-active-link state; close and reopen the modal and confirm it reflects the latest state;
      click outside the modal and press Escape and confirm both close it; confirm zero browser
      console warnings/errors throughout

## 3. Tests (one per spec scenario)

New tests under `frontend/src/components/ui/dialog.test.tsx` and `frontend/src/components/
ShareModal.test.tsx` — 9 `frontend-share` scenarios, plus a beyond-spec unit-test file for the
`Dialog` primitive itself (design.md Decision 2 — its open/close/closing-gesture behavior is
foundational to every scenario below, worth testing directly, not just indirectly):

- [ ] 3.1 Test (beyond spec): `Dialog` renders nothing when `open` is false
- [ ] 3.2 Test (beyond spec): Clicking the overlay calls `onClose`
- [ ] 3.3 Test (beyond spec): Pressing Escape calls `onClose`
- [ ] 3.4 Test: Clicking Share opens the modal for the current note
- [ ] 3.5 Test: A note with no active link shows the expiry-selection UI
- [ ] 3.6 Test: Generating a link for a note with no existing link shows the new link
      immediately
- [ ] 3.7 Test: Generating a new link when one already exists shows a confirmation first
- [ ] 3.8 Test: Confirming the regeneration replaces the link and shows the new one
- [ ] 3.9 Test: A note with an active link shows its URL, expiry, and view count
- [ ] 3.10 Test: Clicking Copy copies the link and shows confirmation feedback (mock
      `navigator.clipboard.writeText` per design.md's disclosed jsdom risk)
- [ ] 3.11 Test: Revoking requires confirmation before the request fires
- [ ] 3.12 Test: Confirming revocation removes the active link and returns to the no-link state

- [ ] 3.13 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green, ≥80% coverage on new files (backend 101/101 unaffected)

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1014-share-modal`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1014 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
