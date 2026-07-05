## Context

FRS Section 6 requires PostgreSQL-native full-text search — no external search service. SDS
Section 3 already describes the target `searchVector` design (a generated `tsvector` column
maintained by a trigger) and Section 12 explicitly lists "tsvector-trigger migration approach"
as an accepted-but-undeployed architecture decision. This ticket deploys it for the first time.
No existing code touches raw SQL or `prisma.$queryRaw` yet — the only precedent for
Prisma-can't-express-this is AB-1006's hand-added functional unique index, which this design
follows the same spirit of (declare what Prisma can express in `schema.prisma`, hand-write the
rest directly into the generated migration file).

**Context7 note**: Context7 MCP was unavailable at the start of this session (see `/start`
output), and the `openspec` CLI itself is currently failing against this machine's corporate npm
proxy with an auth error — neither blocks writing this design, but three specific claims below
(safe parameterization of `prisma.$queryRaw` tagged templates, migration DDL generation for an
`Unsupported("tsvector")` field, and the `FROM table, function(...) AS alias` cross-join SQL
pattern) could not be verified against live docs and are flagged as risks to confirm empirically
at the Foundation checkpoint, same discipline as AB-1005/AB-1006's flagged risks.

## Goals / Non-Goals

**Goals:**
- Deploy the `searchVector` column + maintaining trigger + GIN index (SDS Section 3, resolving
  Section 12's open decision #1).
- Implement `GET /search` per FRS 6.1 (search), 6.2 (highlighting), 6.3 (pagination).
- Correct SDS Section 3's trigger timing (`AFTER` → `BEFORE`) as part of deploying it — see
  Decision 1.

**Non-Goals:**
- No tag-filtered search (`tagIds` on `GET /search`) — explicitly deferred, decided during
  `/spec`.
- No client-configurable sort on search results — ranking is fixed, decided during `/spec`.
- No frontend work (AB-1013).

## Decisions

### Decision 1: The trigger must be `BEFORE`, not `AFTER` — correcting SDS Section 3

SDS Section 3 says the `searchVector` trigger fires `AFTER INSERT OR UPDATE`. Taken literally,
this is incorrect: a trigger that sets `NEW.searchVector` must run `BEFORE` the row is written,
so the computed value is included in the same write. An `AFTER` trigger can only run a *second*
`UPDATE` on the already-inserted row — which would itself re-fire the trigger (requiring a guard
against infinite recursion) and double the write cost on every note create/update for no benefit.

**Chosen approach**: the trigger fires `BEFORE INSERT OR UPDATE OF title, content` and sets
`NEW."searchVector"` directly, the standard idiomatic Postgres pattern for generated-tsvector
columns:
```sql
CREATE FUNCTION note_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER note_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, content ON "Note"
FOR EACH ROW EXECUTE FUNCTION note_search_vector_update();
```
`docs/SDS.md` Section 3 is corrected to say `BEFORE` as part of this ticket's tasks — the same
"fix the spec doc, don't silently diverge from it" discipline used when AB-1006 corrected the
`@@unique` case-sensitivity claim.

**Alternative considered**: an `AFTER` trigger with a self-referential `UPDATE ... WHERE id =
NEW.id` guarded by a recursion check — rejected as needlessly complex and slower (two writes
per note change) for no behavioral benefit over the standard `BEFORE` pattern.

### Decision 2: Two-query read path — raw SQL for ranking/snippet, Prisma for the note shape

`ts_rank`, `ts_headline`, and `websearch_to_tsquery` have no Prisma Client equivalent, so the
ranked id list and snippet must come from `prisma.$queryRaw`. Rather than also hand-writing a
JSON aggregation in raw SQL to reconstruct each note's `tags` (duplicating `NoteService`'s
existing tag-shaping logic), the search path runs two queries:
1. `$queryRaw` → ranked, paginated `{ id, snippet }` rows (the only thing raw SQL is needed for).
2. `prisma.note.findMany({ where: { id: { in: ids } }, include: { tags: true } })` → the full
   note rows, reusing the exact same `include` shape as `NoteService.listNotes`/`getNote`.

The final response is assembled by mapping over the raw query's row order (which already
encodes the rank ordering) and looking up each note from a `Map` built from the second query's
results — Prisma's `id: { in: [...] }` does not guarantee input order, so reordering must happen
in application code, not be assumed from the second query.

`NoteService.ts`'s existing (private) `toNoteSummary` is exported and reused here rather than
duplicated — a minor, behavior-neutral visibility change to `NoteService.ts` (proposal.md said
"no changes to NoteService"; this one-line export is the sole amendment, not a functional
change).

**Alternative considered**: a single raw SQL query using `json_agg`/`json_build_object` to
inline each note's tags directly — rejected as significantly more complex to write and maintain,
duplicates logic that already exists and is already tested in `NoteService`, and this app's data
volumes make three total round-trips (ranked ids, count, note fetch) a non-issue.

### Decision 3: `prisma.$queryRaw` tagged templates only — never `$queryRawUnsafe` or string concatenation

The search query and count query interpolate user input (`q`) and `userId` directly into
`prisma.$queryRaw` **tagged template literals** (`` prisma.$queryRaw`... ${query.q} ...` ``),
which Prisma parameterizes automatically — this is categorically different from building a SQL
string and passing it to `$queryRawUnsafe`, which would be a SQL injection vector. No user input
ever reaches a raw string concatenation path in this design.

**Verification plan** (Context7-unverified risk from Context above): at the Foundation
checkpoint, manually smoke-test a query containing SQL metacharacters (e.g. `q=foo'; DROP TABLE
"Note"; --`) against the real dev Postgres and confirm it is treated as a harmless search term
(likely matching nothing) rather than executed as SQL, before writing automated tests.

### Decision 4: Pagination and count follow the exact `NoteService.listNotes` convention

Same `page`/`pageSize` defaults and `MAX_PAGE_SIZE = 100` clamp as `NoteService.listNotes`
(AB-1005), same `Promise.all`-style parallel fetch pattern (here: the ranked-rows query and the
count query run as two separate `$queryRaw` calls, since a single query can't cheaply return
both a `LIMIT`ed page and an unlimited total without a window function — `COUNT(*) OVER()` was
considered but rejected as an unnecessary complexity for this app's realistic data volumes; two
simple queries are easier to read, test, and reason about).

## Shared Schemas (`packages/shared`)

**New file `packages/shared/src/search.ts`:**
```ts
import { z } from "zod";
import type { NoteSummary } from "./notes.js";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(20),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchResultItem {
  note: NoteSummary;
  snippet: string;
}

export interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
}
```
A missing `q` fails `z.object`'s required-field check; an empty or whitespace-only `q` fails
`.trim().min(1)` — both produce a 400 via the existing `validationError` helper, satisfying the
spec's "missing or empty query rejected" scenario with no extra code.

## Backend Changes

**Modified `backend/prisma/schema.prisma`:** add `searchVector Unsupported("tsvector")?` to
`Note`. Prisma's `Unsupported` type is excluded from the generated Client's create/update input
types automatically, so no existing `NoteService` write path needs to change to avoid
accidentally trying to set it.

**New `backend/src/services/SearchService.ts`:** `searchNotes(userId, query)` implementing
Decisions 2–4; exports nothing else. Imports `toNoteSummary` from `NoteService.ts` (newly
exported, per Decision 2).

**New `backend/src/routes/search.ts`:** single `GET /` route, `requireAuth`-gated, parses via
`searchQuerySchema`, delegates to `searchNotes`, no error branches beyond the 400 validation
case (search has no ownership/not-found errors — it only ever reads the caller's own notes).

**Modified `backend/src/services/NoteService.ts`:** `toNoteSummary` becomes `export`ed (its
signature and behavior are unchanged).

**Modified `backend/src/app.ts`:** mount `searchRouter` at `/api/search`.

## Database Migration

- Add `searchVector Unsupported("tsvector")?` to `schema.prisma`; run
  `prisma migrate dev --create-only` to let Prisma generate the base `ALTER TABLE ... ADD COLUMN
  "searchVector" tsvector` DDL (Prisma's migration *generation* handles `Unsupported` column
  types structurally even though the Client can't query/write them — to be confirmed at the
  Foundation checkpoint per the Context7-unverified risk above; if Prisma does NOT generate this
  DDL automatically, it will be hand-added following the exact same manual-edit precedent as
  AB-1006's functional index).
- Hand-edit the generated migration to append: the trigger function + trigger from Decision 1,
  a `CREATE INDEX ... USING GIN ("searchVector")`, and a one-time backfill
  `UPDATE "Note" SET "searchVector" = ...` (using the same expression as the trigger function) so
  existing rows — including everything created during AB-1004/1005/1006's manual smoke
  testing — get a populated `searchVector` immediately, not just on their next edit.
- **Backward compatible**: purely additive (new nullable-by-DB-default column, new trigger, new
  index) — no existing column or table is altered. The backfill UPDATE touches all existing
  `Note` rows once; for this project's current data volume this is a cheap one-time cost.
- Apply to both the dev and test databases (same two-step process as AB-1006: `prisma migrate
  dev` for dev, then `prisma migrate deploy` with `DATABASE_URL` overridden to `.env.test`'s
  value for the test DB), then `pnpm --filter backend prisma:generate`.

## docs/SDS.md Updates (part of this change)

- **Section 3**: correct the `searchVector` design note's trigger timing from `AFTER INSERT OR
  UPDATE` to `BEFORE INSERT OR UPDATE OF title, content`, with a one-line rationale (matches
  Decision 1).
- **Section 12**: mark the "tsvector-trigger migration approach" open decision as resolved,
  pointing to the new ADR.
- New ADR `docs/decisions/0002-tsvector-trigger-before-not-after.md` documenting Decision 1
  (created as a task, not written directly in this design doc).

## Risks / Trade-offs

- **[Risk]** Three Prisma/Postgres behaviors (raw-template parameterization safety, migration
  DDL generation for `Unsupported` columns, the `FROM table, function(...) AS alias` cross-join
  pattern) are unverified against live docs this session (Context7 unavailable) →
  **Mitigation**: manual smoke test at the Foundation/Core-Implementation checkpoints, including
  the SQL-metacharacter adversarial query from Decision 3, before writing automated tests — same
  discipline as every prior ticket's flagged risks.
- **[Risk]** The backfill `UPDATE` in the migration touches every existing `Note` row →
  **Mitigation**: accepted one-time cost; this project has no production data and dev/test data
  volumes are trivial.
- **[Trade-off]** Three total queries per search request (ranked rows, count, note-by-id fetch)
  instead of one → **Mitigation**: accepted for the maintainability win of reusing
  `NoteService`'s existing tag-inclusion logic rather than duplicating it in raw SQL; revisit
  only if this app ever needs to handle real production-scale query volume, which is out of
  scope for this assignment.
- **[Risk]** `docs/SDS.md`'s existing Section 3 trigger-timing text is actively wrong until this
  ticket's SDS update lands → **Mitigation**: the SDS correction is an explicit task in this
  ticket's `tasks.md`, not a follow-up, exactly like AB-1006's SDS update discipline.
