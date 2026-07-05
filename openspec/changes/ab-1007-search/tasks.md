## 1. Foundation

- [ ] 1.1 Add `packages/shared/src/search.ts`: `searchQuerySchema`, `SearchQuery`,
      `SearchResultItem`, `SearchResponse` (design.md Shared Schemas); export from
      `packages/shared/src/index.ts`
- [ ] 1.2 Update `backend/prisma/schema.prisma`: add `searchVector Unsupported("tsvector")?` to
      `Note`
- [ ] 1.3 Generate the migration: `npx prisma migrate dev --schema backend/prisma/schema.prisma
      --name add_note_search_vector --create-only`; verify whether Prisma auto-generates the
      `ALTER TABLE ... ADD COLUMN "searchVector" tsvector` DDL for the `Unsupported` field
      (design.md's flagged Context7-unverified risk — hand-add it if Prisma doesn't); hand-edit
      the migration to append the trigger function + trigger (Decision 1: `BEFORE INSERT OR
      UPDATE OF title, content`, NOT `AFTER`), a `CREATE INDEX ... USING GIN ("searchVector")`,
      and a one-time backfill `UPDATE "Note" SET "searchVector" = ...` using the same expression
      as the trigger function
- [ ] 1.4 Apply the migration to both the dev and test databases (same two-step process as
      AB-1006); run `pnpm --filter backend prisma:generate`
- [ ] 1.5 Add ADR `docs/decisions/0002-tsvector-trigger-before-not-after.md` documenting
      Decision 1 (context, decision, consequences)
- [ ] 1.6 Update `docs/SDS.md`: Section 3 (correct trigger timing from `AFTER INSERT OR UPDATE`
      to `BEFORE INSERT OR UPDATE OF title, content`, with rationale); Section 12 (mark the
      "tsvector-trigger migration approach" open decision resolved, pointing to the new ADR)
- [ ] 1.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1007 is backend-only (no frontend component; that's AB-1013).

- [ ] 2.1 Export `toNoteSummary` from `backend/src/services/NoteService.ts` (visibility-only
      change, no behavior change — design.md Decision 2)
- [ ] 2.2 Create `backend/src/services/SearchService.ts`: `searchNotes(userId, query)`
      implementing the two-query read path (raw SQL for ranked ids + snippet via
      `websearch_to_tsquery`/`ts_rank`/`ts_headline`, a separate raw count query, then
      `prisma.note.findMany({ where: { id: { in } }, include: { tags: true } })` reordered to
      match the ranked-rows order, mapped via the exported `toNoteSummary`) — Decisions 2–4.
      Use `prisma.$queryRaw` tagged templates exclusively (never `$queryRawUnsafe` or string
      concatenation — Decision 3)
- [ ] 2.3 Create `backend/src/routes/search.ts`: `GET /`, `requireAuth`-gated, parses via
      `searchQuerySchema`, delegates to `searchNotes` (no error branches beyond the 400
      validation case — search has no ownership/not-found errors)
- [ ] 2.4 Mount `searchRouter` at `/api/search` in `backend/src/app.ts`
- [ ] 2.5 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green. Also manually smoke-test against the real dev Postgres per design.md's flagged
      Context7-unverified risks: confirm pre-existing notes (from AB-1004/1005/1006 smoke
      testing) got backfilled `searchVector` values; create notes with distinct title/content
      and confirm `GET /search` finds them, ranked and snippeted correctly; run the
      SQL-metacharacter adversarial query from Decision 3 (e.g. `q=foo'; DROP TABLE "Note"; --`)
      and confirm it's treated as a harmless search term, not executed as SQL; confirm
      cross-user and soft-deleted notes are excluded; confirm pagination behaves like note
      listing

## 3. Tests (one per spec scenario)

New file `backend/tests/search.test.ts` (10 scenarios):

- [ ] 3.1 Test: Successful search returns matching notes
- [ ] 3.2 Test: Search excludes another user's notes
- [ ] 3.3 Test: Search excludes soft-deleted notes
- [ ] 3.4 Test: Missing or empty query rejected
- [ ] 3.5 Test: Query with no matches returns an empty result
- [ ] 3.6 Test: Matched keywords are highlighted in the snippet
- [ ] 3.7 Test: Title is not highlighted
- [ ] 3.8 Test: Results are ordered by relevance
- [ ] 3.9 Test: Custom page size is honored up to the maximum
- [ ] 3.10 Test: Page beyond the last page returns an empty list

- [ ] 3.11 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1007-search`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1007 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
