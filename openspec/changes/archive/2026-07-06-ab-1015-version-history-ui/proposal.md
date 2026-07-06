## Why

FRS 8.1–8.4 (snapshot on save, list versions, view version, restore) are fully implemented on
the backend (AB-1009) but have no frontend surface yet. This ticket builds the version history
view that lets a note's owner see past versions and restore one.

## What Changes

- **History entry point** (decided during `/spec`): a "History" button in `NoteEditorPage`'s
  header, next to "Share" (AB-1014), opens a modal listing the current note's retained versions.
- **Reuses the existing `Dialog` primitive** (decided during `/spec`): the ticket's "drawer"
  wording is treated as informal language for "a panel showing version history," not a literal
  side-sliding-panel requirement — nothing in FRS 8.1–8.4 mandates a specific visual treatment,
  and building a second modal primitive for this ticket alone would be disproportionate.
- **List versions, newest first** (FRS 8.2): each entry shows its title and timestamp. The
  backend's list endpoint (`GET /notes/:id/versions`) already returns each version's full
  `content` alongside `title`/`createdAt` (confirmed by reading `VersionService.ts` — there is no
  separate lightweight list shape), so selecting a version to preview reuses the already-fetched
  data with no second network call.
- **View version content** (FRS 8.3): selecting a version shows its content as extracted plain
  text (reusing the `extractPlainText` helper already used by the notes list and search), not a
  full rich-text rendering — building a second read-only TipTap instance for a preview panel is
  more than this ticket needs.
- **Restore with confirmation** (FRS 8.4, decided during `/spec`): clicking "Restore" on a
  version shows an inline confirmation before firing the request, consistent with AB-1014's
  regenerate/revoke confirmation pattern.
- **Restoring updates the live editor immediately** (decided during `/spec`): `NoteEditorPage`
  only loads a note's title/content into the TipTap editor once on mount (to avoid a background
  refetch clobbering in-progress edits — AB-1012's `isProgrammaticUpdate` guard). A successful
  restore explicitly re-applies the restored version's title/content into the already-mounted
  editor using that same guard, so the user immediately sees what they just restored instead of
  stale pre-restore content.
- **Out of scope for this ticket**: FRS 8.5 (auto-purge) is a backend-only concern, already
  shipped in AB-1009 and not assigned to this ticket's FRS scope; a global "version history
  across all notes" view (the spec is per-note, matching the backend's per-note contract).

## Capabilities

### New Capabilities
- `frontend-version-history`: the version history modal — entry point, listing, viewing a
  version's content, restore with confirmation, and syncing the restored content into the live
  editor, per FRS 8.1–8.4.

### Modified Capabilities
(none — `version-history` is a backend capability whose requirements are unchanged; this ticket
only consumes its existing `GET /notes/:id/versions`, `GET /notes/:id/versions/:versionId`
[unused, see Impact], and `POST /notes/:id/versions/:versionId/restore` contracts.
`frontend-editor` is not modified — the "History" button and post-restore content sync are
described as part of the new `frontend-version-history` capability's own requirements, not a
change to any existing `frontend-editor` requirement's described behavior.)

## Impact

- **New frontend code**: `frontend/src/lib/versionsApi.ts` (`listVersions`, `restoreVersion` —
  `getVersion`/the single-version detail endpoint is not called by the frontend at all, since the
  list response already contains every version's full content, per the decision above);
  `frontend/src/components/VersionHistoryModal.tsx`.
- **Modified frontend code**: `frontend/src/pages/NoteEditorPage.tsx` gains a "History" button, a
  conditionally-mounted `<VersionHistoryModal>` (applying the lesson from AB-1014's post-archive
  review fix — always conditionally mount modals, never rely solely on the `Dialog` primitive's
  internal `open` check), and an `onRestored` callback that re-applies the restored note's
  title/content into the editor and directly writes the fresh note into the `["note", id]` query
  cache (`queryClient.setQueryData`, not just an invalidate-and-wait, since the restore mutation's
  own response is already the authoritative fresh state).
- **No new dependency** — reuses the existing `Dialog` primitive, TanStack Query, and
  `extractPlainText`.
- **No backend changes** — consumes the existing version-history endpoints exactly as documented
  (SDS Section 5).
- **No changes to `packages/shared`** — reuses `NoteVersionSummary` as-is.
- **No changes to `docs/SDS.md`** — no new API contract, status code, or DB field.
