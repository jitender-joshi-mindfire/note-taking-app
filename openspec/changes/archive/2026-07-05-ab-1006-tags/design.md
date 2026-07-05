## Context

`backend/prisma/schema.prisma` has no `Tag` model today — `docs/SDS.md` Section 3 describes the
target `Tag` model and `Note`↔`Tag` relation as part of the overall system design, but no ticket
has migrated it yet. This is therefore the first DB migration since AB-1004 (`add_notes`). The
`notes` capability already has an ownership-scoping pattern (`findFirst({ where: { id, userId,
deletedAt: null } })`) and a version-snapshot-in-transaction pattern from AB-1004/1005 that this
design reuses rather than reinventing.

**Context7 note**: Context7 MCP was reported unavailable at the start of this session (see
`/start` output). Two Prisma features this design relies on — filtered relation counts
(`_count.select.<relation>.where`) and nested `tags: { set: [...] }` writes on an implicit
many-to-many — could not be verified against live docs before writing this design. Both are
long-standing, well-documented Prisma features, but per this project's Library Verification
rule this is flagged as a risk to be confirmed empirically at the Phase 2 checkpoint (manual
smoke test against the real dev Postgres, same as AB-1005's precedent for its `orderBy` risk)
rather than trusted blindly.

## Goals / Non-Goals

**Goals:**
- Add the `Tag` model and `Note`↔`Tag` many-to-many relation via Prisma migration.
- Implement full tag CRUD (FRS 5.1) with live-computed note counts (FRS 5.2).
- Implement tag attachment via `PATCH /notes/:id`'s new `tagIds` field (replace-set semantics).
- Implement tag filtering on `GET /notes` (FRS 4.6.1, AND semantics).
- Update `docs/SDS.md` Section 3 (schema) and Section 5 (API contracts) to match.

**Non-Goals:**
- No frontend work (AB-1011+).
- No dedicated attach/detach-single-tag endpoints — rejected in favor of `PATCH /notes/:id`
  (decided during `/spec`).
- No tag reordering, nesting, or hierarchy — out of FRS scope entirely.

## Decisions

### Decision 1: Case-insensitive tag name uniqueness via a hand-added functional unique index

FRS 5.1.2 requires tag names be unique per user, case-insensitively. Prisma's `@@unique(...)`
attribute can only express a plain (case-sensitive) constraint — it cannot target `lower(name)`.

**Chosen approach**: declare `name String` in `schema.prisma` with no `@@unique` there; generate
the migration with `prisma migrate dev --create-only`, then hand-edit the generated
`migration.sql` to add:
```sql
CREATE UNIQUE INDEX "Tag_userId_name_ci_key" ON "Tag" ("userId", lower("name"));
```
This mirrors the project's existing precedent of hand-written raw SQL for things Prisma can't
express declaratively (the `searchVector` trigger in `docs/SDS.md` Section 3). Application code
creates/renames a tag by just attempting the write and catching a `P2002` unique-violation error
— the same pattern already used for duplicate-email detection in `AuthService.register` (chosen
specifically because AB-1002's review caught a check-then-act race in an earlier draft of that
same logic; relying on the DB constraint as the sole source of truth closes that race by
construction here too).

**Alternatives considered**:
- *Postgres `citext` extension column* — would let `@@unique([userId, name])` work natively and
  is arguably cleaner, but enabling a Postgres extension via Prisma's `postgresqlExtensions`
  preview feature is a bigger, less-reversible infrastructure change for one field, and its
  exact current syntax couldn't be verified without Context7 this session. Rejected in favor of
  the lower-risk, already-precedented raw-SQL-index approach.
- *App-level pre-check (`findFirst` then `create`)* — rejected outright; this is the exact race
  pattern AB-1002's review flagged and fixed elsewhere in this codebase.

### Decision 2: Tag attachment is a full replace-set on `PATCH /notes/:id`, validated inside the update transaction

Per the `/spec` clarification, `tagIds` on `PATCH /notes/:id` is a complete desired-state array,
not an incremental add/remove. Ownership of every id in `tagIds` is verified with
`tx.tag.findMany({ where: { id: { in: uniqueTagIds }, userId } })` **inside the same
`prisma.$transaction`** as the version snapshot and the update itself — not as a separate
pre-check before the transaction opens. This closes the TOCTOU window where a tag could be
deleted or reassigned between an out-of-transaction check and the write; it costs nothing extra
since the transaction was already required for the version-snapshot pattern.

If any id fails ownership verification, the transaction throws `InvalidTagIdsError` before any
write happens (Prisma rolls back the whole transaction on a thrown error) — satisfying the spec's
"SHALL NOT partially apply" requirement by construction, not by manual cleanup.

**Alternative considered**: rely on Prisma's nested `tags: { set: [...] } }` to fail naturally via
a `P2025` (record not found) when an id doesn't exist, and catch that instead of a pre-check.
Rejected because `P2025` alone can't distinguish "id doesn't exist" from "id exists but belongs
to another user" (a foreign tag id is a perfectly valid row from Prisma's point of view) — an
explicit ownership check is required regardless, so the pre-check subsumes the need for `set` to
ever fail this way at all.

### Decision 3: Tag filtering as an AND-of-`some` clauses, not a single `every`

FRS 4.6.1 requires "note must have all specified tags" (AND semantics). The correct Prisma
pattern for "has at least each of these specific ids" on a many-to-many is one `{ tags: { some:
{ id } } }` clause per requested id, combined with `AND`:
```ts
where: {
  userId, deletedAt: null,
  ...(tagIds.length > 0 ? { AND: tagIds.map((id) => ({ tags: { some: { id } } } as const)) } : {}),
}
```
This also gives the spec's "unknown/foreign tag id → empty result, no special-case code" behavior
for free: a `some: { id }` clause for a nonexistent or foreign tag id can never match any of the
caller's notes (a note can only ever be linked to tags the caller owns, per Decision 2), so the
query naturally returns zero rows — no explicit existence/ownership check needed on the read
path, mirroring AB-1005's "no special-case for out-of-range page" precedent.

**Alternative considered**: Prisma's relation filter `every` (`{ tags: { every: { id: { in:
tagIds } } } }`) — rejected because it means "every attached tag is *in* this list" (a subset
check in the wrong direction), not "every id in this list is attached" — it would incorrectly
match a note with zero tags (vacuously true) and would allow extra unrelated tags to be ignored.

### Decision 4: Note responses embed a lean tag reference, not the full tag summary

The `tags` field on a note response includes only `{ id, name, color }` — not `noteCount` or
`createdAt`, which only make sense in the tags-list context. Modeled as a distinct
`TagRef` type in `packages/shared/src/tags.ts` (see Shared Schemas below), extended by
`TagSummary` for the tags-list response, avoiding duplicating the three common fields.

## Shared Schemas (`packages/shared`)

**New file `packages/shared/src/tags.ts`:**
```ts
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be a 6-digit hex string like #RRGGBB");

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: hexColorSchema.optional(),
});

export const updateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    color: hexColorSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: "At least one of name or color must be provided",
  });

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export interface TagRef {
  id: string;
  name: string;
  color: string | null;
}

export interface TagSummary extends TagRef {
  createdAt: string;
}

export interface TagListItem extends TagSummary {
  noteCount: number;
}

export interface TagListResponse {
  items: TagListItem[];
}
```

**Modified `packages/shared/src/notes.ts`:**
- `listNotesQuerySchema` gains a `tagIds` field accepting either a single repeated query value or
  an array (Express/qs parses `?tagIds=a&tagIds=b` as an array but a single `?tagIds=a` as a
  bare string), normalized to always yield `string[]`:
  ```ts
  const tagIdsQuerySchema = z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));

  export const listNotesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(20),
    sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("updatedAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    tagIds: tagIdsQuerySchema,
  });
  ```
- `updateNoteSchema` gains `tagIds: z.array(z.string().uuid()).optional()`, and the `.refine(...)`
  condition is widened to accept any of `title`/`content`/`tagIds` being present (previously
  title-or-content only) — this is the concrete implementation of the spec's "Update with no
  fields rejected" scenario, now covering three fields instead of two.
- `NoteSummary` gains `tags: TagRef[]` (imported from `./tags.js`).

## Backend Changes

**New `backend/src/services/TagService.ts`:**
- `createTag(userId, name, color?)` → catches `P2002` → `DuplicateTagNameError`; returns the tag
  with `noteCount: 0` (a brand-new tag can't have notes yet).
- `listTags(userId)` → `prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" },
  include: { _count: { select: { notes: { where: { deletedAt: null } } } } } })`, mapped to
  `TagListResponse`. Sort order (alphabetical by name) is a design choice, not an FRS
  requirement — chosen for predictable, testable ordering since neither FRS nor SDS specifies
  one.
- `updateTag(userId, tagId, updates)` → ownership-scoped `findFirst` (404 if missing/not owned),
  then `update` catching `P2002` → `DuplicateTagNameError`.
- `deleteTag(userId, tagId)` → `prisma.tag.deleteMany({ where: { id: tagId, userId } })`,
  `count === 0` → `TagNotFoundError`. Prisma automatically removes the implicit join-table rows
  for a deleted record in an implicit many-to-many — no manual tag-note unlink step needed,
  which is what makes FRS 5.1.4 ("removes association, not the notes") true by construction.

**New `backend/src/routes/tags.ts`:** thin routes mirroring `backend/src/routes/notes.ts`'s
existing shape — parse with the Zod schema, delegate to `TagService`, map errors
(`DuplicateTagNameError` → 409, `TagNotFoundError` → 404). Mounted with `requireAuth` on all
routes, matching `notesRouter`'s pattern.

**Modified `backend/src/services/NoteService.ts`:**
- `toNoteSummary` now maps a `tags` relation (`{ id, name, color }[]`) onto `NoteSummary.tags`.
- `createNote` passes `tags: []` explicitly (a new note can't have tags yet — FRS/SDS give no
  way to set tags at creation time) rather than querying for an always-empty relation.
- `listNotes` builds the `AND`-of-`some` tag filter from Decision 3 and adds `include: { tags:
  true }` to both the `findMany` and (implicitly, no change needed) the `count`.
- `getNote` adds `include: { tags: true }`.
- `updateNote` signature gains `tagIds?: string[]`; implements Decision 2's in-transaction
  ownership check and `tags: { set: [...] }`; throws a new `InvalidTagIdsError` on failure.

**Modified `backend/src/routes/notes.ts`:**
- `GET /` already parses `req.query` through `listNotesQuerySchema` (AB-1005) — no route code
  change needed beyond the schema itself gaining `tagIds`; `listNotes` already receives the full
  parsed query object.
- `PATCH /:id` passes `parsed.data.tagIds` through to `updateNote` and adds an
  `InvalidTagIdsError` → 400 branch alongside the existing `NoteNotFoundError` → 404 branch.

**Modified `backend/src/app.ts`:** import and mount `tagsRouter` at `/api/tags`.

## Database Migration

- New `Tag` model per `docs/SDS.md` Section 3 (as amended below), plus the implicit `Note`↔`Tag`
  many-to-many join table Prisma generates automatically from `tags Tag[] @relation("NoteTags")`
  on both `Note` and `Tag`.
- **Backward compatible**: purely additive — no existing table's columns change, no data
  migration needed (all existing notes simply have zero tags after this migration).
- Steps: `npx prisma migrate dev --schema backend/prisma/schema.prisma --name add_tags
  --create-only`, hand-edit the generated SQL to add the functional unique index from Decision
  1, then `npx prisma migrate dev --schema backend/prisma/schema.prisma` to apply, then
  `pnpm --filter backend prisma:generate` (Prisma 7's `migrate dev` does not auto-run `generate`
  — the lesson from AB-1002's setup).
- Rollback: `prisma migrate dev` has no built-in down-migration; if this needs reverting before
  it reaches a shared environment, drop the migration directory and re-run against a reset dev
  DB. No production data exists yet in this project's lifecycle, so no live-rollback plan is
  needed at this stage.

## docs/SDS.md Updates (part of this change)

- **Section 3**: replace the `Tag` model's `@@unique([userId, name])` line with `@@index([userId])`
  and a design note explaining the case-insensitive uniqueness is enforced via a hand-added raw
  SQL functional unique index on `(userId, lower(name))`, cross-referencing a new ADR.
- **Section 5**: `GET /notes` and `GET /notes/:id` success shapes gain a `tags: TagRef[]` field
  on the note object; `PATCH /notes/:id` request row gains optional `tagIds`; the Tags table's
  existing rows stay as documented (already correct).
- New ADR `docs/decisions/0001-tag-name-case-insensitive-uniqueness.md` documenting Decision 1
  (created as a task, not written directly in this design doc).

## Risks / Trade-offs

- **[Risk]** Filtered relation `_count` and nested `tags: { set }` couldn't be verified via
  Context7 this session → **Mitigation**: manual smoke test against the real dev Postgres at the
  Phase 2 checkpoint (create tags, attach/detach, verify counts and filters) before writing
  automated tests, same precedent as AB-1005.
- **[Risk]** Hand-edited migration SQL is easy to get wrong or to lose on a future
  `prisma migrate reset` if not committed exactly as generated → **Mitigation**: the edited
  `migration.sql` is committed to git like any other migration file; `prisma migrate reset`
  replays committed migration files, so this is safe as long as the edit is committed.
- **[Trade-off]** In-transaction tag-ownership verification adds one extra query
  (`tx.tag.findMany`) to every `PATCH /notes/:id` call that includes `tagIds` — accepted, this
  only runs when the caller is actually changing tags, and correctness (closing the TOCTOU race)
  outweighs the marginal cost.
- **[Risk]** `docs/SDS.md`'s existing `Tag` model text becomes inaccurate the moment this ticket
  merges unless updated in the same change → **Mitigation**: SDS update is an explicit task in
  this ticket's `tasks.md`, not a follow-up.
