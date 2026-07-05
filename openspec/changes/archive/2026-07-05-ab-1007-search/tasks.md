## 1. Foundation

- [x] 1.1 Add `packages/shared/src/search.ts`: `searchQuerySchema`, `SearchQuery`,
      `SearchResultItem`, `SearchResponse` (design.md Shared Schemas); export from
      `packages/shared/src/index.ts`
- [x] 1.2 Update `backend/prisma/schema.prisma`: add `searchVector Unsupported("tsvector")?` to
      `Note`
- [x] 1.3 Generate the migration: `npx prisma migrate dev --schema backend/prisma/schema.prisma
      --name add_note_search_vector --create-only`; Prisma DID auto-generate the
      `ALTER TABLE ... ADD COLUMN "searchVector" tsvector` DDL (design.md's flagged risk
      resolved — confirmed by inspection); hand-edited the migration to append the trigger
      function + trigger (Decision 1: `BEFORE INSERT OR UPDATE OF title, content`, NOT `AFTER`),
      `CREATE INDEX ... USING GIN ("searchVector")`, and a one-time backfill
      `UPDATE "Note" SET "searchVector" = ...`
- [x] 1.4 Applied the migration to both the dev and test databases; ran
      `pnpm --filter backend prisma:generate`. Verified directly against Postgres: column,
      GIN index, and `BEFORE` trigger all present; all pre-existing rows backfilled with a
      non-null `searchVector`
- [x] 1.5 Add ADR `docs/decisions/0002-tsvector-trigger-before-not-after.md` documenting
      Decision 1 (context, decision, consequences)
- [x] 1.6 Update `docs/SDS.md`: Section 3 and Section 6 corrected trigger timing from
      `AFTER INSERT OR UPDATE` to `BEFORE INSERT OR UPDATE OF title, content`, with rationale;
      Section 12 marked the "tsvector-trigger migration approach" open decision resolved,
      pointing to the new ADR. Section 5's `GET /search` contract already matched the
      implementation — no change needed there.
- [x] 1.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend test` → 63/63 green (no sequencing gap this time — `search.ts`
      isn't consumed anywhere until Phase 2)

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1007 is backend-only (no frontend component; that's AB-1013).

- [x] 2.1 Export `toNoteSummary` from `backend/src/services/NoteService.ts` (visibility-only
      change, no behavior change — design.md Decision 2)
- [x] 2.2 Create `backend/src/services/SearchService.ts`: `searchNotes(userId, query)`
      implementing the two-query read path (raw SQL for ranked ids + snippet via
      `websearch_to_tsquery`/`ts_rank`/`ts_headline`, a separate raw count query, then
      `prisma.note.findMany({ where: { id: { in } }, include: { tags: true } })` reordered to
      match the ranked-rows order, mapped via the exported `toNoteSummary`) — Decisions 2–4.
      Uses `prisma.$queryRaw` tagged templates exclusively (never `$queryRawUnsafe` or string
      concatenation — Decision 3)
- [x] 2.3 Create `backend/src/routes/search.ts`: `GET /`, `requireAuth`-gated, parses via
      `searchQuerySchema`, delegates to `searchNotes` (no error branches beyond the 400
      validation case — search has no ownership/not-found errors)
- [x] 2.4 Mount `searchRouter` at `/api/search` in `backend/src/app.ts`
- [x] 2.5 Checkpoint: `pnpm build` → 0 errors (confirming `$queryRaw` tagged templates and the
      `Note`+tags Prisma type both type-check cleanly), `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend test` → 63/63 still green. Manually smoke-tested against the real
      dev Postgres per design.md's flagged risks: confirmed multi-word content search with
      correct relevance ranking and `<mark>` highlighting; ran the SQL-metacharacter adversarial
      query (`q=foo'; DROP TABLE "Note"; --`) and confirmed it was safely parameterized (treated
      as a harmless search term, `Note` table intact afterward, confirmed via a follow-up
      `GET /notes` call); confirmed missing `q` → 400 and empty `q` → 400 with distinct Zod
      error messages; confirmed cross-user exclusion (user B's search for user A's exact content
      returned empty); confirmed soft-deleted notes disappear from search results immediately;
      confirmed `pageSize` pagination behaves like note listing — all behaved exactly as
      designed

## 3. Tests (one per spec scenario)

New file `backend/tests/search.test.ts` (10 scenarios):

- [x] 3.1 Test: Successful search returns matching notes
- [x] 3.2 Test: Search excludes another user's notes
- [x] 3.3 Test: Search excludes soft-deleted notes
- [x] 3.4 Test: Missing or empty query rejected
- [x] 3.5 Test: Query with no matches returns an empty result
- [x] 3.6 Test: Matched keywords are highlighted in the snippet
- [x] 3.7 Test: Title is not highlighted
- [x] 3.8 Test: Results are ordered by relevance
- [x] 3.9 Test: Custom page size is honored up to the maximum
- [x] 3.10 Test: Page beyond the last page returns an empty list

- [x] 3.11 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend exec vitest run --coverage` → 73/73 green. Coverage: 91.94%
      stmts/91.88% lines overall; `SearchService.ts` 100%, `routes/search.ts` 100% (confirmed
      via raw coverage-final.json — the text-summary table's printed rows omitted this one file
      due to a v8-reporter display quirk, not missing coverage) — well above the 80% bar

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1007-search`
- [x] 4.2 Update `docs/TICKETS.md` AB-1007 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
