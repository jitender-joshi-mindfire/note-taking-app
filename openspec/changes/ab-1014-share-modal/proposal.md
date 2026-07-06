## Why

FRS 7.1–7.4 (generate, revoke, public access, view count) are fully implemented on the backend
(AB-1008) but have no frontend surface yet. This ticket builds the share modal that lets a note's
owner actually generate, view, copy, and revoke a public share link.

## What Changes

- **Share entry point** (decided during `/spec`): a "Share" button in `NoteEditorPage`'s header
  row (next to "Back to notes") opens a modal for the note currently being edited.
- **New modal primitive** (decided during `/spec`): no `Dialog`/modal UI component exists yet in
  `frontend/src/components/ui/`. Hand-written to match shadcn's standard style, consistent with
  the existing `Button`/`Input`/`Label`/`Card` primitives (all hand-written for the same reason —
  the corporate npm registry blocking the shadcn CLI, disclosed in AB-1010's tasks.md).
- **Generate link with preset expiry** (FRS 7.1, decided during `/spec`): the modal offers three
  preset expiry choices — 7, 30, or 90 days — rather than a free-form number input, covering the
  common cases with no client-side range validation needed (the backend's 1–365 bound is
  satisfied by construction).
- **Regenerate confirmation** (FRS 7.1.3, decided during `/spec`): generating a link for a note
  that already has an active one shows an inline confirmation first, since doing so immediately
  invalidates the existing link (which may already be shared with someone). Generating a link for
  a note with no existing link needs no confirmation.
- **Active link display**: when a note has an active share link (already present on every note
  object via `shareLink: { token, url, expiresAt, viewCount } | null` — no new fetch needed), the
  modal shows its URL, expiry date, and current view count.
- **Copy to clipboard**: a "Copy" action next to the active link's URL, with visible feedback
  (e.g. the button briefly reads "Copied!").
- **Revoke with confirmation** (FRS 7.2, decided during `/spec`): revoking requires an inline
  confirmation before the `DELETE` request fires, consistent with the regenerate confirmation
  above.
- **No-active-link state**: when a note has no active share link, the modal shows only the
  expiry-selection UI, not any link details.
- **Out of scope for this ticket**: the public share view itself (`GET /share/:token`'s
  read-only page — FRS 7.3, no ticket currently assigned for it in `docs/TICKETS.md`), any
  "list of all my active share links across notes" view (FRS 7.1–7.4 describe a single link per
  note; this ticket's modal is per-note, opened from the note currently being edited).

## Capabilities

### New Capabilities
- `frontend-share`: the share modal — entry point, generate-with-preset-expiry, regenerate
  confirmation, active-link display, copy-to-clipboard, revoke-with-confirmation, and the
  no-active-link state, per FRS 7.1, 7.2, 7.4 (view count display only — atomic increment itself
  is a backend-only guarantee, AB-1008).

### Modified Capabilities
(none — `sharing` is a backend capability whose requirements are unchanged; this ticket only
consumes its existing `POST /notes/:id/share` / `DELETE /notes/:id/share` contracts and the
already-present `shareLink` field on note objects. `frontend-editor` is not modified — the new
"Share" button is described as part of the new `frontend-share` capability's own entry-point
requirement, not a change to any existing `frontend-editor` requirement's described behavior.)

## Impact

- **New frontend code**: `frontend/src/components/ui/dialog.tsx` (hand-written modal primitive);
  `frontend/src/components/ShareModal.tsx`; `frontend/src/lib/shareApi.ts` (typed request
  functions — `generateShareLink`, `revokeShareLink` — on top of the existing authenticated API
  client).
- **Modified frontend code**: `frontend/src/pages/NoteEditorPage.tsx` gains a "Share" button and
  renders `<ShareModal>`.
- **No new dependency** — the hand-written dialog primitive uses only React state (open/closed)
  and existing Tailwind classes, no portal/focus-trap library.
- **No backend changes** — consumes the existing `POST /notes/:id/share`, `DELETE
  /notes/:id/share` endpoints and the note object's existing `shareLink` field exactly as
  documented (SDS Section 5).
- **No changes to `packages/shared`** — reuses `generateShareLinkSchema`, `GenerateShareLinkInput`,
  `ShareLinkRef` as-is.
- **No changes to `docs/SDS.md`** — no new API contract, status code, or DB field.
