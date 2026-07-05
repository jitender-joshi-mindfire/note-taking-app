## Why

FRS Section 8 requires owners to list, view, and restore any retained version of their notes,
with history automatically bounded to prevent unbounded storage growth. Snapshotting itself
(FRS 8.1) already exists — `createNote` and `updateNote` have created `NoteVersion` rows in the
same transaction as the write since AB-1004. What's missing is everything a user can actually
*do* with that history: list it, view a specific past version, restore one, and the retention
cap (FRS 8.5) that keeps it bounded.

## What Changes

- **`GET /notes/:id/versions`** (FRS 8.2.1): lists the owner's note's retained versions, newest
  first. Returns only historical `NoteVersion` rows — the live/current title+content (already
  visible via `GET /notes/:id`) is not synthesized into this list (decided during `/spec`).
- **`GET /notes/:id/versions/:versionId`** (FRS 8.3.1): returns the full content of one retained
  version. The version must belong to the specified note — verified by checking
  `version.noteId === note.id` in addition to note ownership, closing an IDOR risk (a version id
  alone is not sufficient to prove access; the URL's note id must match).
- **`POST /notes/:id/versions/:versionId/restore`** (FRS 8.4.1): applies the target version's
  `title`/`content` to the note via the exact same update path `PATCH /notes/:id` already uses —
  this means a restore automatically snapshots the note's *pre-restore* state as a new version
  (satisfying "restore creates a new current version, never rewrites history") with zero new
  version-creation code. Restoring content identical to the current state proceeds normally,
  creating a redundant snapshot — no special-casing (decided during `/spec`).
- **50-version retention cap** (FRS 8.5.1, SDS Section 3): every version-creating write (create,
  update, restore — restore reuses update's path so this is one enforcement point, not three)
  now also purges the oldest version(s) beyond 50 for that note, in the same transaction as the
  write. Not yet implemented anywhere — `updateNote` currently creates versions with no cap.
- **Soft-deleted notes 404 on all three new endpoints** (decided during `/spec`), consistent
  with every other note sub-resource (tags, share links) already treating a soft-deleted note as
  not-found.

## Capabilities

### New Capabilities
- `version-history`: list/view/restore a note's retained versions, per FRS 8.2, 8.3, 8.4.

### Modified Capabilities
- `notes`: the "Note Update" requirement gains the 50-version retention cap (FRS 8.5) as part of
  its existing version-snapshotting behavior. ("Note Creation" is unaffected — a brand-new note
  always has exactly one version, so a cap of 50 can never bind at creation time.)

## Impact

- **No DB migration** — `NoteVersion` already has every column this ticket needs (`title`,
  `content`, `createdAt`, `noteId`); only application logic changes.
- **Modified backend code**: `backend/src/services/NoteService.ts` (`updateNote` gains
  retention-cap enforcement in its existing transaction).
- **New backend code**: `backend/src/services/VersionService.ts` (list, get, restore),
  registered as new routes under the existing `notesRouter` in `backend/src/routes/notes.ts`
  (same pattern AB-1008 used for the `/:id/share` sub-resource routes).
- **New shared code**: `packages/shared/src/versions.ts` (`NoteVersionSummary` type; no new Zod
  input schema needed — restore takes no request body, list/get take no query params per SDS).
- **No changes to `docs/SDS.md`** — Section 5's Version History API contract and Section 8's
  design are already accurate and match this implementation exactly.
- **No frontend changes** — version history UI is AB-1015.
