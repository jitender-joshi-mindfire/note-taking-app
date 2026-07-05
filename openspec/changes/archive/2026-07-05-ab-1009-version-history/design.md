## Context

`createNote` and `updateNote` (`backend/src/services/NoteService.ts`) have created `NoteVersion`
rows in the same transaction as the write since AB-1004 — FRS 8.1 is already satisfied. This
ticket adds everything downstream of that: listing, viewing, and restoring versions (FRS
8.2–8.4), plus the 50-version retention cap (FRS 8.5, documented in SDS Section 3 since the
schema was first designed but never enforced anywhere).

Unlike AB-1006/1007/1008, this ticket introduces no new Prisma feature, raw SQL, or DB schema
change — every operation it needs (`findFirst`, `count`, `findMany` with `orderBy`/`take`,
`deleteMany`, `$transaction`) has already been used and verified working elsewhere in this
codebase. No Context7-unverified risk to flag this time.

## Goals / Non-Goals

**Goals:**
- `GET /notes/:id/versions`, `GET /notes/:id/versions/:versionId`,
  `POST /notes/:id/versions/:versionId/restore` (FRS 8.2, 8.3, 8.4).
- Enforce the 50-version retention cap in `updateNote`'s existing transaction (FRS 8.5).

**Non-Goals:**
- No changes to `createNote` — a brand-new note always has exactly one version, so the cap can
  never bind there.
- No frontend work (AB-1015).
- No version diffing/comparison UI or API — FRS only asks for view and restore.

## Decisions

### Decision 1: Restore reuses `updateNote` verbatim — no new version-creation code path

SDS Section 8 already specifies this: "apply [the version's] `title`/`content` to the `Note` via
the same update path used by `PATCH /notes/:id` ... this satisfies FRS 8.4.1 ... without a
separate code path." `VersionService.restoreVersion` reads the target `NoteVersion`, then calls
`NoteService.updateNote(userId, noteId, { title, content })` directly — the existing pre-update
snapshot logic, the (no-op here) `tagIds` handling, and the new retention-cap logic (Decision 2)
all apply automatically, for free.

**Alternative considered**: a separate restore-specific transaction that snapshots and applies
in one bespoke block — rejected as pure duplication of `updateNote`'s existing, already-tested
logic, and exactly what SDS explicitly says to avoid.

### Decision 2: Retention cap enforced by count-then-delete-oldest, inside the existing transaction

Inside `updateNote`'s transaction, immediately after the new `NoteVersion` is created:
```ts
const versionCount = await tx.noteVersion.count({ where: { noteId: note.id } });
if (versionCount > MAX_RETAINED_VERSIONS) {
  const excess = await tx.noteVersion.findMany({
    where: { noteId: note.id },
    orderBy: { createdAt: "asc" },
    take: versionCount - MAX_RETAINED_VERSIONS,
    select: { id: true },
  });
  await tx.noteVersion.deleteMany({ where: { id: { in: excess.map((v) => v.id) } } });
}
```
`MAX_RETAINED_VERSIONS = 50` per SDS Section 3. Using `versionCount - MAX_RETAINED_VERSIONS`
(not a hardcoded `take: 1`) makes this correct even in a hypothetical future where more than one
version could be created per write — though today exactly one write always creates exactly one
version, so this only ever deletes 0 or 1 rows in practice.

**Alternative considered**: a database trigger (like AB-1007's `searchVector` trigger) —
rejected; this logic needs no raw SQL and is simpler, more testable, and more maintainable as
plain application code inside the existing transaction, with no new migration required.

### Decision 3: A version's ownership is validated via `noteId` match, not a standalone lookup

`NoteVersion` has no `userId` column — only `noteId`. `VersionService.getVersion` and
`restoreVersion` both first verify the note (from the URL's `:id`) is owned by the caller and
not soft-deleted (reusing `NoteNotFoundError`, same pattern as every other note sub-resource),
**then** look up the version scoped by `{ id: versionId, noteId }` — never by `id` alone. This
closes an IDOR risk: without the `noteId` filter, a version id belonging to a note the caller
doesn't own (but whose id the caller somehow obtained) would be readable/restorable by
supplying any owned note's id in the URL alongside that foreign version id.

**Alternative considered**: look up the version by id first, then check its `note.userId`
matches — rejected as functionally equivalent but requiring an extra join/include for no
benefit; filtering by `{ id, noteId }` directly is simpler and makes the invariant obvious at
the query level.

### Decision 4: List and view return only historical rows — no synthetic "current" entry

Per `/spec`, `GET /notes/:id/versions` returns only real `NoteVersion` rows (`orderBy: {
createdAt: "desc" }`), not a synthesized pseudo-entry for the note's live state. A client
wanting "the current state" already has it via `GET /notes/:id`.

## Shared Schemas (`packages/shared`)

**New file `packages/shared/src/versions.ts`:**
```ts
export interface NoteVersionSummary {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}
```
No new Zod input schema — `GET /notes/:id/versions` and `GET /notes/:id/versions/:versionId`
take no query params, and `POST .../restore` takes no request body, per SDS Section 5's
contract.

## Backend Changes

**New `backend/src/services/VersionService.ts`:**
- `listVersions(userId, noteId)` → ownership-scoped `findFirst` (404 via `NoteNotFoundError` if
  missing/not owned/soft-deleted, reusing `NoteService`'s exported error), then
  `noteVersion.findMany({ where: { noteId }, orderBy: { createdAt: "desc" } })`.
- `getVersion(userId, noteId, versionId)` → same ownership check, then `noteVersion.findFirst({
  where: { id: versionId, noteId } })` (Decision 3); `count === 0`/`null` → new
  `VersionNotFoundError`.
- `restoreVersion(userId, noteId, versionId)` → same ownership check, same
  `{ id: versionId, noteId }` lookup, then delegates to `NoteService.updateNote` (Decision 1),
  returning its `NoteSummary` result directly (already matches SDS's `201 { note }` shape).

**Modified `backend/src/services/NoteService.ts`:** `MAX_RETAINED_VERSIONS = 50` constant;
`updateNote`'s transaction gains the count-then-purge step from Decision 2, placed immediately
after the existing `tx.noteVersion.create(...)` call.

**Modified `backend/src/routes/notes.ts`:** three new routes on the existing `notesRouter`
(already `requireAuth`-gated), following the exact same file-organization pattern AB-1008 used
for `/:id/share`:
- `GET /:id/versions` → `listVersions`, 404 on `NoteNotFoundError`
- `GET /:id/versions/:versionId` → `getVersion`, 404 on `NoteNotFoundError` or
  `VersionNotFoundError`
- `POST /:id/versions/:versionId/restore` → `restoreVersion`, 404 on the same two error types

## Database Migration

None — `NoteVersion` already has every column this ticket needs. Purely an application-logic
change.

## Risks / Trade-offs

- **[Trade-off]** The retention-cap check runs a `count` query on every update, even for notes
  nowhere near the 50-version limit → accepted; this is a single indexed `COUNT(*)` on
  `noteId` (already indexed via `@@index([noteId, createdAt])`), negligible cost, and simpler
  than trying to track a running counter separately (which would itself need to stay
  transactionally consistent with the version table — no simpler than just counting).
- **[Risk]** None flagged as Context7-unverified — every Prisma operation this ticket uses has
  already been exercised and confirmed correct in this codebase (AB-1004's `updateNote`
  transaction, AB-1005's `orderBy`/pagination, AB-1006's `deleteMany`/ownership patterns).
  Still worth a manual smoke test at the Core Implementation checkpoint to confirm the specific
  combination (count → find oldest → delete, all inside one transaction) behaves as expected
  under normal use, per this project's standing discipline.
