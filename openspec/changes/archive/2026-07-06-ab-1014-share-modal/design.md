## Context

The backend `POST/DELETE /notes/:id/share` endpoints (AB-1008) have no frontend consumer yet, and
every note object already carries `shareLink: { token, url, expiresAt, viewCount } | null` (SDS
Section 5) — no new fetch is needed to know a note's current share state, `NoteEditorPage`'s
existing `useQuery(["note", id], ...)` already has it.

No modal/dialog UI primitive exists in `frontend/src/components/ui/` yet — this is the first
ticket needing one. Consistent with `Button`/`Input`/`Label`/`Card` (all hand-written in AB-1010
due to the corporate npm registry blocking the shadcn CLI), a minimal `Dialog` is hand-written
here rather than pulled from the CLI or a new dependency (e.g. Radix's `@radix-ui/react-dialog`,
already a transitive dep of `@radix-ui/react-slot` but not a direct one — adding it as a direct
dependency for one modal is more than this ticket needs).

## Goals / Non-Goals

**Goals:**
- A hand-written `Dialog` primitive (open/close, click-outside-to-close, Escape-to-close).
- A `ShareModal` component covering generate/regenerate-confirm/revoke-confirm/copy/no-link
  states, per the `frontend-share` spec.
- A "Share" button in `NoteEditorPage`'s header opening the modal for the current note.

**Non-Goals:**
- A full focus-trap/accessibility-complete dialog implementation (e.g. `@radix-ui/react-dialog`'s
  full feature set — focus restoration, `aria-modal`, tabbable-element cycling). This ticket's
  `Dialog` covers open/close and the two closing gestures the spec requires; deeper a11y work is
  a candidate follow-up, not blocking this ticket's FRS scope.
- The public share view page itself (`GET /share/:token`, FRS 7.3) — no ticket assigns it yet.
- Any "all my share links across notes" list view — FRS 7.1–7.4 describe one link per note.

## File Paths

**New:**
- `frontend/src/components/ui/dialog.tsx` — `Dialog({ open, onClose, children })`: renders
  nothing when `!open`; otherwise an overlay + centered panel; clicking the overlay or pressing
  Escape calls `onClose`; clicking inside the panel does not (stops propagation)
- `frontend/src/lib/shareApi.ts` — `generateShareLink(noteId, input: GenerateShareLinkInput):
  Promise<ShareLinkSummary>` (`POST /notes/:id/share`), `revokeShareLink(noteId: string):
  Promise<void>` (`DELETE /notes/:id/share`), both via `authenticatedFetch`
- `frontend/src/components/ShareModal.tsx` — the modal's content and state machine (Decision 1)

**Modified:**
- `frontend/src/pages/NoteEditorPage.tsx` — adds a "Share" button in the header row (next to
  "Back to notes") and local `isShareModalOpen` state; conditionally renders `<ShareModal
  note={noteQuery.data} open={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />`

**No backend, no `packages/shared`, no `docs/SDS.md` changes.**

## Decisions

### Decision 1: `ShareModal` shows the mutation's own response immediately; invalidates the note
query in the background for eventual consistency — no local copy of server state kept around
On a successful generate, `generateMutation.data` (the endpoint's own `{ token, url, expiresAt }`
response) is rendered immediately as the active link (view count starts at 0, matching the
backend's guarantee that a fresh link always resets it) — no need to wait for a refetch to show
what the mutation itself just confirmed. In the same `onSuccess`, `queryClient.invalidateQueries({
queryKey: ["note", note.id] })` refreshes `NoteEditorPage`'s own note data in the background, so
the rest of the app (and a future reopening of the modal) sees the authoritative state. Revoke
works the same way: a local `justRevoked` flag flips the modal to the no-active-link state
immediately, alongside the same background invalidation. Since `ShareModal` is conditionally
mounted (`{isShareModalOpen && <ShareModal ... />}`, not always-mounted-but-hidden), all of this
local state naturally resets to nothing every time the modal is reopened — no explicit reset
logic needed on close.
**Alternative considered**: wait for the invalidated query to refetch before updating the modal's
displayed state — rejected, adds a visible loading flicker for information the mutation's own
response already provided.

### Decision 2: `Dialog` is hand-written with only open/close + the two spec-required closing
gestures, not a full focus-trap implementation
The `frontend-share` spec doesn't require keyboard focus cycling or `aria-modal` semantics —
just that the modal opens, and (implicitly, standard modal UX) can be closed. A hand-written
`<div className="fixed inset-0 ...">` overlay with an `onClick` calling `onClose`, a nested panel
that stops click propagation, and a `useEffect` `keydown` listener for `Escape` covers this
without a new dependency.
**Alternative considered**: add `@radix-ui/react-dialog` as a direct dependency — rejected as
disproportionate for one modal in one ticket; already flagged as a non-goal above, revisit if a
later ticket needs a second modal with real accessibility requirements.

### Decision 3: Preset expiry buttons hold `expiresInDays` as one of three literal values, no
custom-input escape hatch
Per the proposal's decision, only 7/30/90 are offered. `ShareModal`'s local state is
`expiresInDays: 7 | 30 | 90`, defaulting to 7, rendered as three toggle-style buttons (visually
matching `NotesPage`'s tag-filter chip pattern — active/inactive `Button` variants, not a native
`<select>`, since these are three mutually-exclusive single-choice options rather than a longer
list).
**Alternative considered**: a `<select>` like `NotesPage`'s sort control — rejected, three
options read better as buttons than a dropdown, and there's precedent for both patterns already
in this codebase (chips for tags, select for sort) so this isn't introducing a third convention.

### Decision 4: Regenerate/revoke confirmations are inline state swaps within `ShareModal`, not a
second nested `Dialog`
"Inline confirmation" (per the proposal) means the button itself is replaced by a
confirm/cancel pair when clicked, tracked via local `showRegenerateConfirm`/`showRevokeConfirm`
booleans — no second modal stacked on top of the first.
**Alternative considered**: a native `window.confirm()` — rejected, inconsistent with this
project's UI conventions (every other confirmation-adjacent flow in this app, e.g. AB-1010's
duplicate-email error, renders inline, never a browser-native dialog).

## Risks / Trade-offs

- **[Risk]** `navigator.clipboard.writeText` may not be implemented in jsdom (the test
  environment) the same way it is in a real browser. → **Mitigation**: mock
  `navigator.clipboard.writeText` via `vi.stubGlobal` (or an equivalent per-test mock) in the
  Copy-button test, matching how other browser-only APIs would need mocking in this test
  environment; confirmed manually in the real-browser smoke test (task 2.5) that the actual
  clipboard write works, not just the mocked assertion.
- **[Risk]** The hand-written `Dialog` lacks focus trapping — a keyboard user could tab out of
  the modal into the page behind it. → **Mitigation**: explicitly disclosed as a Non-Goal above,
  not silently skipped; acceptable for this ticket's FRS scope, revisit if accessibility becomes
  a tracked requirement in a later ticket.
- **[Risk]** Background query invalidation (Decision 1) means if the `POST`/`DELETE` succeeds but
  the subsequent `GET /notes/:id` refetch fails (e.g. a transient network blip), the modal's
  locally-rendered state and the note query's cached state could briefly disagree. →
  **Mitigation**: low-severity and self-healing — the note query's normal refetch-on-next-mount
  behavior will reconcile it, and the mutation's own response (rendered immediately) is the
  authoritative source of truth for what the user just did, regardless of the background
  refetch's outcome.

## Checkpoint Plan

- After foundation (`dialog.tsx`, `shareApi.ts`): `pnpm build` → 0 errors, `pnpm lint
  --max-warnings 0`, `pnpm test` → all still green (no new tests yet beyond `Dialog`'s own basic
  behavior, if tested directly, which should already pass).
- After core implementation (`ShareModal.tsx`, `NoteEditorPage.tsx` wiring): `pnpm build`, `pnpm
  lint`, `pnpm test`, plus a manual browser smoke test against the live backend: open a note with
  no active link, generate one with each expiry preset, confirm the link/expiry/view-count-0
  appear immediately; copy the link and confirm the real clipboard receives it (paste elsewhere
  to verify) and the button shows "Copied!"; generate again and confirm the regenerate
  confirmation appears before replacing it; revoke and confirm the revoke confirmation appears
  before the link disappears; reopen the modal after closing it and confirm it reflects the
  latest state; confirm zero browser console warnings/errors.
- After tests (one per spec scenario, `frontend-share`): `pnpm build`, `pnpm lint
  --max-warnings 0`, `pnpm test --coverage` → all green, ≥80% coverage on new files.
