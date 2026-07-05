## Why

AB-1004 shipped `GET /notes` with a fixed-default paginated envelope (page 1, page size 20, no
sorting) specifically so this ticket could add real pagination and sorting without a breaking
response-shape change. This is that ticket.

## What Changes

- `GET /notes` accepts `page` and `pageSize` query parameters (default 20, max 100) instead of
  always using fixed defaults.
- `GET /notes` accepts `sortBy` (`createdAt` | `updatedAt` | `title`) and `sortDir`
  (`asc` | `desc`) query parameters. An unrecognized `sortBy` value is rejected with 400.
- Requesting a page beyond the last page of results returns 200 with an empty `items` array
  (not an error) — `total`/`page`/`pageSize` still reflect reality.
- **Deferred, not implemented here:** FRS 4.6 (tag filtering via `tagIds`) — `Tag` doesn't exist
  in the schema yet (AB-1006 introduces it). Tracked in `docs/TICKETS.md`'s AB-1006 row so it
  isn't forgotten, same precedent as AB-1004 deferring share-link revocation to AB-1008.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `notes`: the "Note Retrieval" requirement's list behavior changes from fixed-default
  pagination to configurable pagination + sorting.

## Impact

- **No DB changes** — pagination/sorting operate on the existing `Note` table via Prisma
  `orderBy`/`skip`/`take`, no new columns or indexes required beyond what AB-1004 already added.
- **Modified backend code**: `backend/src/services/NoteService.ts` (`listNotes`),
  `backend/src/routes/notes.ts` (query param parsing).
- **New shared code**: a `listNotesQuerySchema` in `packages/shared/src/notes.ts` validating
  `page`, `pageSize`, `sortBy`, `sortDir`.
- **No breaking changes** — `GET /notes` with no query params behaves exactly as it did after
  AB-1004 (page 1, page size 20); existing default sort (`updatedAt desc`) becomes the explicit
  default rather than the only option.
