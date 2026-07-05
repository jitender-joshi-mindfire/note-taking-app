## 1. Foundation

- [x] 1.1 Add `Note`, `NoteVersion` models and `User.notes` relation to
      `backend/prisma/schema.prisma` (scoped subset per design.md Decision 1 — no
      tags/shareLink/searchVector yet)
- [x] 1.2 Run `prisma migrate dev` to create and apply the migration, regenerate the Prisma
      client; apply the same migration to the test database
- [x] 1.3 Add `packages/shared/src/notes.ts`: `createNoteSchema`, `updateNoteSchema` (with
      `.refine` requiring at least one field), `NoteSummary`, `NoteListResponse` types; export
      from `packages/shared/src/index.ts`
- [x] 1.4 Extract `validationError` out of `backend/src/routes/auth.ts` into
      `backend/src/lib/validation.ts` (design.md Decision 4), update `routes/auth.ts` to import
      it from there
- [x] 1.5 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1004 is backend-only (no frontend component; that's AB-1011/1012).

- [x] 2.1 Add `NoteNotFoundError` and `createNote`, `listNotes`, `getNote` to
      `backend/src/services/NoteService.ts` — each scoped via
      `where: { id, userId, deletedAt: null }` (design.md Decision 2); `createNote` inserts the
      note and its first `NoteVersion` in one transaction
- [x] 2.2 Add `updateNote` to `NoteService.ts`: read current note (ownership-scoped), then in one
      `$transaction` create a `NoteVersion` of the prior state and apply only the provided
      fields (design.md Decision 3)
- [x] 2.3 Add `deleteNote` to `NoteService.ts`: atomic `updateMany` with
      `where: { id, userId, deletedAt: null }` setting `deletedAt`; if `count === 0`, throw
      `NoteNotFoundError`
- [x] 2.4 Add `backend/src/routes/notes.ts`: wire `POST /`, `GET /`, `GET /:id`, `PATCH /:id`,
      `DELETE /:id`, all behind `requireAuth`; `GET /` returns the fixed-default paginated
      envelope (page 1, pageSize 20)
- [x] 2.5 Mount the notes router at `/api/notes` in `backend/src/app.ts`
- [x] 2.6 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green. Also manually smoke-tested all 5 endpoints against a real Postgres instance
      (unauthenticated rejection, create/list/get/update/delete, empty-title and empty-PATCH
      validation, cross-user 404s, soft-delete row survival, and version-snapshot creation on
      both create and update, verified directly against the database) — all behaved correctly.

## 3. Tests (one per spec scenario)

- [x] 3.1 Test: Successful note creation
- [x] 3.2 Test: Empty title rejected
- [x] 3.3 Test: Creation produces the first version snapshot
- [x] 3.4 Test: List returns only the caller's own non-deleted notes
- [x] 3.5 Test: Reading a note not owned by the caller returns not found
- [x] 3.6 Test: Reading a soft-deleted note returns not found
- [x] 3.7 Test: Partial update applies only the provided fields
- [x] 3.8 Test: Update with no fields rejected
- [x] 3.9 Test: Update creates a version snapshot of the prior state
- [x] 3.10 Test: Updating a note not owned by the caller returns not found
- [x] 3.11 Test: Delete sets deletedAt instead of removing the row
- [x] 3.12 Test: Soft-deleted notes disappear from list and detail endpoints
- [x] 3.13 Test: Deleting a note not owned by the caller returns not found
- [x] 3.14 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code (achieved 89.78%
      statements/lines, 95.55% functions). Also fixed a real cross-test-file interference
      bug: notes.test.ts passed 13/13 alone but failed when run alongside auth.test.ts,
      because both share one Postgres test database and Vitest ran the files in parallel,
      letting one file's beforeEach cleanup race another file's in-flight test data. Fixed
      by setting `fileParallelism: false` in vitest.config.ts.

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1004-notes-crud`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1004 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
