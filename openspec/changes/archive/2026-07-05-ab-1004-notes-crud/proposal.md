## Why

Auth (AB-1002, AB-1003) is done but the app has nothing for users to actually do yet. This adds
the core Notes CRUD capability — create, read, update, soft-delete — that every later feature
(tags, search, sharing, version history) builds on top of.

## What Changes

- Add `POST /notes`, `GET /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id`, all
  behind `requireAuth` — the first feature area to consume AB-1002's auth middleware.
- Every resource is strictly scoped to its owning user; cross-user access returns 404 (FRS 4.2.2).
- Delete is soft-delete only (`deletedAt` timestamp), never a physical row removal (FRS 4.4.1).
- Every create/update snapshots a `NoteVersion` (FRS 4.1.3, 4.3.2) — the version-history feature
  (AB-1009) will read these snapshots later, but this ticket is what starts writing them.
- `GET /notes` returns the full paginated envelope (`{ items, total, page, pageSize }`) from the
  start, with fixed defaults (page 1, page size 20) — pagination/sorting/tag-filtering
  parameters themselves are AB-1005, not this ticket, but the response shape doesn't change
  between the two tickets.
- **Deferred, not implemented here:** FRS 4.4.4 ("deleting a note revokes any active share
  link") — `ShareLink` doesn't exist in the schema yet (AB-1008 introduces it). Tracked in
  `docs/TICKETS.md`'s AB-1008 row so it isn't forgotten when Sharing is built.

## Capabilities

### New Capabilities

- `notes`: Note creation, retrieval (single + list), partial update, and soft delete, each
  producing/consuming version snapshots.

### Modified Capabilities

(none)

## Impact

- **New DB tables** (docs/SDS.md Section 3): `Note`, `NoteVersion`.
- **New backend code**: `backend/src/routes/notes.ts`, `backend/src/services/NoteService.ts`.
- **New shared code**: Zod schemas for create/update note request bodies and the list-response
  envelope in `packages/shared/src/notes.ts`.
- **No breaking changes** — net-new feature area, nothing existing depends on it.
