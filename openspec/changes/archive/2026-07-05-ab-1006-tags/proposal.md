## Why

Notes currently have no way to be organized beyond title/content. FRS 5.1/5.2 require user-scoped
tags with note counts, and FRS 4.6 (explicitly deferred out of AB-1005 because `Tag` didn't exist
yet — see `openspec/specs/notes/spec.md`'s Note Retrieval requirement) requires filtering the
notes list by tag. This ticket introduces the `Tag` model, its CRUD API, and the note-tag
attachment path needed to make both of those FRS sections real.

## What Changes

- **New `Tag` model** (Prisma migration): `id`, `userId`, `name` (unique per user,
  case-insensitive, 1–50 chars), `color` (optional, validated as a 6-digit hex string
  `#RRGGBB`), `createdAt`. Cascade-deleted with the user.
- **New Note↔Tag many-to-many relation** (Prisma migration): a note can have zero or more tags;
  deleting a tag removes the association only, never the note (FRS 5.1.4).
- **New `tags` capability**: `POST /tags`, `GET /tags` (each item includes `noteCount` — the
  count of that tag's non-deleted notes, computed via Prisma `_count`, never denormalized),
  `PATCH /tags/:id`, `DELETE /tags/:id`. All scoped to the authenticated caller; cross-user
  access returns 404, per this project's standing convention.
- **Tag attachment via `PATCH /notes/:id`**: adds an optional `tagIds` field to the existing note
  update endpoint. When present, it SHALL be treated as the note's complete desired tag set
  (replace-set semantics, not incremental add/remove) — chosen over dedicated attach/detach
  endpoints to reuse the existing, already-tested update path rather than adding new endpoints
  for what a typical note editor treats as one save operation.
- **`GET /notes` gains tag filtering** (FRS 4.6.1): a new `tagIds` query parameter (repeated,
  e.g. `?tagIds=a&tagIds=b`) filters to notes having ALL specified tags (AND semantics, per FRS
  4.6.1). A `tagIds` value that doesn't exist or isn't owned by the caller yields an empty result
  for that filter (no error, no enumeration of other users' tag IDs) rather than a 400 or a
  silently-dropped ID.
- **Note responses gain a `tags` field**: both the single-note and list-note response shapes now
  include the note's attached tags (id, name, color) so a client can render them without a
  second round-trip. This extends `docs/SDS.md` Section 5's Notes API contract — updated
  alongside this change, not merely implied by it.

## Capabilities

### New Capabilities
- `tags`: user-scoped tag CRUD (create, list-with-note-count, update, delete) per FRS 5.1 and 5.2.

### Modified Capabilities
- `notes`: the "Note Retrieval" requirement gains tag-filtering on `GET /notes` (FRS 4.6.1) and
  both retrieval scenarios' response shape gains a `tags` field; the "Note Update" requirement
  gains the optional `tagIds` replace-set field on `PATCH /notes/:id`.

## Impact

- **DB migration required**: this is the first schema change since AB-1004. Adds the `Tag` table
  and the implicit Prisma many-to-many join table for `Note`↔`Tag`. No existing table's shape
  changes.
- **New backend code**: `backend/src/services/TagService.ts`, `backend/src/routes/tags.ts`,
  registered under `/api/tags` in `backend/src/app.ts`.
- **Modified backend code**: `backend/src/services/NoteService.ts` (`listNotes` tag filter,
  `updateNote` tag replace-set, response mapping for the new `tags` field),
  `backend/src/routes/notes.ts` (accept `tagIds` on both `GET /` and `PATCH /:id`).
- **New shared code**: `packages/shared/src/tags.ts` (`createTagSchema`, `updateTagSchema`,
  `TagSummary` type); `packages/shared/src/notes.ts` gains `tagIds` on
  `listNotesQuerySchema`/`updateNoteSchema` and a `tags` field on `NoteSummary`.
- **`docs/SDS.md` update**: Section 5 (Notes and Tags API contracts) updated to reflect the
  `tags` field on note responses and the `tagIds` additions — done as part of this change per
  the project rule that no new API shape ships without an SDS update.
- **No frontend changes** — tag UI is AB-1011 (notes list, tag filter) and later tickets.
