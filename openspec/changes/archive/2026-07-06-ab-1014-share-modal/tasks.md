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

- [x] 2.1 Create `frontend/src/components/ShareModal.tsx` (Decision 1, 3, 4): local state for
      `expiresInDays: 7 | 30 | 90` (default 7, rendered as three toggle buttons per Decision 3),
      `showRegenerateConfirm`/`showRevokeConfirm` booleans (Decision 4), `copied` (transient,
      reset after a short timeout), `justGenerated: ShareLinkSummary | null`, `justRevoked:
      boolean`; a `useQueryClient()` + `useMutation` for generate and one for revoke, each
      invalidating `["note", note.id]` in `onSuccess` (Decision 1); renders the no-active-link
      expiry-selection UI when neither `note.shareLink` nor `justGenerated` is present and
      `justRevoked` is false; renders the active-link URL/expiry/view-count plus a "Copy" button
      (using `navigator.clipboard.writeText`) and a "Revoke" button otherwise; clicking
      "Generate" shows the regenerate confirmation first only if an active link already exists
      (Decision 4), otherwise generates immediately. **Hardened during smoke testing**: added an
      explicit `generateMutation.isPending`/`revokeMutation.isPending` re-entrancy guard inside
      `handleGenerateClick`/`handleConfirmGenerate`/`handleConfirmRevoke` (not just the `disabled`
      DOM attribute, which doesn't protect against two handler invocations landing before React
      re-renders) after an initial exploratory test appeared to show two `POST /share` calls from
      one click — a since-instrumented, clean re-test (direct `fetch` call counting) showed
      exactly one call per click, so the double-call was most likely a testing-methodology
      artifact rather than a reproducible bug, but the guard is added regardless as defensive
      hardening consistent with `NoteEditorPage.tsx`'s established in-flight-mutation pattern
      (AB-1012). Also wrapped `navigator.clipboard.writeText` in `try/catch` — an unrelated real
      bug was found where a rejected clipboard write (e.g. from a non-trusted synthetic click in
      testing) left the "Copy" button silently stuck with no feedback and no error; it now fails
      silently by design (no error UI, matching this being a low-stakes convenience action) but
      no longer throws an unhandled promise rejection.
- [x] 2.2 Update `frontend/src/pages/NoteEditorPage.tsx`: add a "Share" button in the header row
      next to "Back to notes"; add local `isShareModalOpen` state; conditionally render
      `<ShareModal note={noteQuery.data} open={isShareModalOpen} onClose={() =>
      setIsShareModalOpen(false)} />`
- [x] 2.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → still
      green. Manually smoke-tested in a real browser (via the Preview tool) against the real
      backend (port 3000 occupied by a stray `kubectl port-forward` again — reused the
      still-running port-4100 backend instance): opened a note with no active link, clicked
      "Share", generated a link with the default preset and confirmed the URL/expiry/
      view-count-0 appeared immediately; confirmed via direct `fetch`-call instrumentation that
      exactly one `POST /notes/:id/share` fires per click (see 2.1's note on the re-entrancy
      guard added regardless); clicked "Generate" again on the now-active-link note and confirmed
      the regenerate confirmation appeared before the link was replaced with a new token; clicked
      "Revoke" and confirmed the revoke confirmation appeared before the link disappeared, then
      confirmed the modal showed the no-active-link state; confirmed clicking outside the modal
      and pressing Escape both close it; confirmed zero browser console errors/warnings
      throughout

## 3. Tests (one per spec scenario)

New tests under `frontend/src/components/ui/dialog.test.tsx` and `frontend/src/components/
ShareModal.test.tsx` — 9 `frontend-share` scenarios, plus a beyond-spec unit-test file for the
`Dialog` primitive itself (design.md Decision 2 — its open/close/closing-gesture behavior is
foundational to every scenario below, worth testing directly, not just indirectly):

- [x] 3.1 Test (beyond spec): `Dialog` renders nothing when `open` is false
- [x] 3.2 Test (beyond spec): Clicking the overlay calls `onClose`
- [x] 3.3 Test (beyond spec): Pressing Escape calls `onClose`
- [x] 3.4 Test: Clicking Share opens the modal for the current note
- [x] 3.5 Test: A note with no active link shows the expiry-selection UI
- [x] 3.6 Test: Generating a link for a note with no existing link shows the new link
      immediately
- [x] 3.7 Test: Generating a new link when one already exists shows a confirmation first
- [x] 3.8 Test: Confirming the regeneration replaces the link and shows the new one
- [x] 3.9 Test: A note with an active link shows its URL, expiry, and view count
- [x] 3.10 Test: Clicking Copy copies the link and shows confirmation feedback (mock
      `navigator.clipboard.writeText` per design.md's disclosed jsdom risk)
- [x] 3.11 Test: Revoking requires confirmation before the request fires
- [x] 3.12 Test: Confirming revocation removes the active link and returns to the no-link state

- [x] 3.13 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test
      --coverage` → all green, ≥80% coverage on new files (backend 101/101 unaffected)

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1014-share-modal`
- [x] 4.2 Update `docs/TICKETS.md` AB-1014 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)

## 5. Post-archive review fix

- [x] 5.1 The fresh-context reviewer sub-agent run before `/pr` independently re-examined the
      double-POST concern from 2.1's smoke-testing note and confirmed the prior conclusion holds
      (no reproducible click-handler double-invocation; a more likely explanation is
      `apiClient.ts`'s existing 401-refresh-retry legitimately issuing two real network calls for
      one logical request when the access token happened to be expired at click time). It also
      found a genuine, reproducible, previously-undetected bug: `NoteEditorPage.tsx` rendered
      `<ShareModal>` **unconditionally** rather than `{isShareModalOpen && <ShareModal ... />}` as
      design.md's Decision 1 specifies — only `Dialog`'s internal `open` check hid the modal
      visually, so `ShareModal` stayed mounted for the entire life of the editor page and its
      local confirmation state (`showRevokeConfirm`, `showRegenerateConfirm`, `copied`,
      `justGenerated`, `justRevoked`) persisted across closes/reopens instead of resetting.
      Reproducible consequence: click "Revoke", close the modal without confirming (Escape or
      click-outside), reopen via "Share" — the modal reopened straight into the stale "Revoke
      this link?" confirmation instead of the normal active-link view. Fixed by wrapping
      `<ShareModal>` in the conditional render design.md always specified. Added a regression
      test ("Reopening Share after closing mid-confirmation shows the normal state, not the stale
      confirmation") to `NoteEditorPage.test.tsx`. Re-ran the full checkpoint after the fix:
      build/lint clean, 80/80 frontend + 101/101 backend tests green, `NoteEditorPage.tsx`
      coverage improved to 92.04%.
