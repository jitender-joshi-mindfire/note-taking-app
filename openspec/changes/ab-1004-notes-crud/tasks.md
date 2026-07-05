## 1. Foundation

- [ ] 1.1 Add `Note`, `NoteVersion` models and `User.notes` relation to
      `backend/prisma/schema.prisma` (scoped subset per design.md Decision 1 — no
      tags/shareLink/searchVector yet)
- [ ] 1.2 Run `prisma migrate dev` to create and apply the migration, regenerate the Prisma
      client; apply the same migration to the test database
- [ ] 1.3 Add `packages/shared/src/notes.ts`: `createNoteSchema`, `updateNoteSchema` (with
      `.refine` requiring at least one field), `NoteSummary`, `NoteListResponse` types; export
      from `packages/shared/src/index.ts`
- [ ] 1.4 Extract `validationError` out of `backend/src/routes/auth.ts` into
      `backend/src/lib/validation.ts` (design.md Decision 4), update `routes/auth.ts` to import
      it from there
- [ ] 1.5 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1004 is backend-only (no frontend component; that's AB-1011/1012).

- [ ] 2.1 Add `NoteNotFoundError` and `createNote`, `listNotes`, `getNote` to
      `backend/src/services/NoteService.ts` — each scoped via
      `where: { id, userId, deletedAt: null }` (design.md Decision 2); `createNote` inserts the
      note and its first `NoteVersion` in one transaction
- [ ] 2.2 Add `updateNote` to `NoteService.ts`: read current note (ownership-scoped), then in one
      `$transaction` create a `NoteVersion` of the prior state and apply only the provided
      fields (design.md Decision 3)
- [ ] 2.3 Add `deleteNote` to `NoteService.ts`: atomic `updateMany` with
      `where: { id, userId, deletedAt: null }` setting `deletedAt`; if `count === 0`, throw
      `NoteNotFoundError`
- [ ] 2.4 Add `backend/src/routes/notes.ts`: wire `POST /`, `GET /`, `GET /:id`, `PATCH /:id`,
      `DELETE /:id`, all behind `requireAuth`; `GET /` returns the fixed-default paginated
      envelope (page 1, pageSize 20)
- [ ] 2.5 Mount the notes router at `/api/notes` in `backend/src/app.ts`
- [ ] 2.6 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all green

## 3. Tests (one per spec scenario)

- [ ] 3.1 Test: Successful note creation
- [ ] 3.2 Test: Empty title rejected
- [ ] 3.3 Test: Creation produces the first version snapshot
- [ ] 3.4 Test: List returns only the caller's own non-deleted notes
- [ ] 3.5 Test: Reading a note not owned by the caller returns not found
- [ ] 3.6 Test: Reading a soft-deleted note returns not found
- [ ] 3.7 Test: Partial update applies only the provided fields
- [ ] 3.8 Test: Update with no fields rejected
- [ ] 3.9 Test: Update creates a version snapshot of the prior state
- [ ] 3.10 Test: Updating a note not owned by the caller returns not found
- [ ] 3.11 Test: Delete sets deletedAt instead of removing the row
- [ ] 3.12 Test: Soft-deleted notes disappear from list and detail endpoints
- [ ] 3.13 Test: Deleting a note not owned by the caller returns not found
- [ ] 3.14 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1004-notes-crud`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1004 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
