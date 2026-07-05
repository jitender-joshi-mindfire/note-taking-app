## 1. Foundation

- [x] 1.1 Add `listNotesQuerySchema` to `packages/shared/src/notes.ts` (`page`, `pageSize`,
      `sortBy`, `sortDir`, each with a Zod default per design.md); export the inferred
      `ListNotesQuery` type
- [x] 1.2 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

No DB migration this phase — design.md confirms no schema changes are needed.

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1005 is backend-only (no frontend component; that's AB-1011).

- [x] 2.1 Update `NoteService.listNotes` to accept `{ page, pageSize, sortBy, sortDir }`: clamp
      `pageSize` to 100 (design.md Decision 1), build `orderBy` dynamically from `sortBy`/`sortDir`
      (Decision 4); verify the computed `orderBy` type-checks against Prisma's
      `NoteOrderByWithRelationInput` without needing an unsafe cast — confirmed: type-checks
      cleanly with no assertion needed, resolving design.md's flagged risk
- [x] 2.2 Update `GET /` in `backend/src/routes/notes.ts` to parse `req.query` through
      `listNotesQuerySchema`, returning 400 via the existing `validationError` helper on failure
      (covers the invalid-`sortBy` rejection)
- [x] 2.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green. Also manually smoke-tested against a real Postgres instance: default sort, sort by
      title asc, custom pageSize, pageSize capping at 100, invalid sortBy rejection, and
      out-of-range page returning empty items — all behaved correctly.

## 3. Tests (one per spec scenario)

Three of the eight scenarios below already have passing tests from AB-1004
(`backend/tests/notes.test.ts`) whose underlying behavior is unchanged by this ticket — confirm
they still pass as-is rather than rewriting them.

- [x] 3.1 Test: List returns only the caller's own non-deleted notes (existing AB-1004 test —
      confirmed still passes with default `sortBy=updatedAt&sortDir=desc` now explicit)
- [x] 3.2 Test: Custom page size is honored up to the maximum
- [x] 3.3 Test: Page size above the maximum is capped
- [x] 3.4 Test: Sorting by title ascending
- [x] 3.5 Test: Unrecognized sortBy value rejected
- [x] 3.6 Test: Page beyond the last page returns an empty list
- [x] 3.7 Test: Reading a note not owned by the caller returns not found (existing AB-1004 test —
      confirmed still passes, untouched by this ticket)
- [x] 3.8 Test: Reading a soft-deleted note returns not found (existing AB-1004 test — confirmed
      still passes, untouched by this ticket)
- [x] 3.9 Checkpoint: `pnpm build` → 0 errors, `pnpm lint` → 0 errors, `pnpm test --coverage` →
      43/43 green. Coverage: 90% stmts / 89.96% lines overall; `NoteService.ts` 96.29% stmts,
      `routes/notes.ts` 90.9% stmts — well above the 80% bar for new code

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1005-notes-pagination-sorting`
- [x] 4.2 Update `docs/TICKETS.md` AB-1005 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
