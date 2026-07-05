## 1. Foundation

- [x] 1.1 Add `packages/shared/src/versions.ts`: `NoteVersionSummary` (design.md Shared Schemas);
      export from `packages/shared/src/index.ts`
- [x] 1.2 Confirmed no `backend/prisma/schema.prisma` change is needed — `NoteVersion` already
      has every column this ticket uses
- [x] 1.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend test` → 90/90 green. As predicted, no sequencing gap this time —
      `NoteVersionSummary` is a standalone new type, not a required field added to an existing
      shared type

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1009 is backend-only (no frontend component; that's AB-1015).

- [x] 2.1 Create `backend/src/services/VersionService.ts`: `listVersions` (ownership check +
      `findMany` ordered newest first), `getVersion` (ownership check + `{ id: versionId,
      noteId }` lookup, Decision 3), `restoreVersion` (ownership check + `{ id: versionId,
      noteId }` lookup + delegate to `NoteService.updateNote`, Decision 1); reuses
      `NoteService`'s exported `NoteNotFoundError`; new `VersionNotFoundError`
- [x] 2.2 Update `backend/src/services/NoteService.ts`: add `MAX_RETAINED_VERSIONS = 50`;
      `updateNote`'s transaction gains the count-then-purge-oldest step (Decision 2)
      immediately after the existing `tx.noteVersion.create(...)` call
- [x] 2.3 Update `backend/src/routes/notes.ts`: add `GET /:id/versions`, `GET
      /:id/versions/:versionId`, `POST /:id/versions/:versionId/restore` to the existing
      `notesRouter`, mapping `NoteNotFoundError`/`VersionNotFoundError` to 404
- [x] 2.4 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend test` → 90/90 still green. Manually smoke-tested against the real
      dev Postgres: listed versions for a note with several edits (confirmed newest-first
      order), viewed a specific version, confirmed requesting another note's version id 404s on
      both view and restore (IDOR check), restored an old version (confirmed the note's current
      title/content updated, confirmed a new version was created capturing the pre-restore
      state, confirmed the version count went from 2 to 3 with no existing version deleted or
      reordered), updated a note 55 times (56 total version-creating writes) and confirmed
      exactly 50 versions remain with the correct oldest (`v5`) and newest (`v54`) boundary —
      every behavior matched the design exactly

## 3. Tests (one per spec scenario)

**New capability `version-history`** (new file `backend/tests/versions.test.ts`, 10 scenarios):

- [x] 3.1 Test: Listing returns retained versions newest first
- [x] 3.2 Test: Listing versions for a note not owned by the caller returns not found
- [x] 3.3 Test: Listing versions for a soft-deleted note returns not found
- [x] 3.4 Test: Viewing a retained version returns its full content
- [x] 3.5 Test: Viewing a version for a note not owned by the caller returns not found
- [x] 3.6 Test: Viewing a version id that belongs to a different note returns not found
- [x] 3.7 Test: Restoring a version applies its content as the new current state
- [x] 3.8 Test: Restoring creates a new version without altering existing history
- [x] 3.9 Test: Restoring a note not owned by the caller returns not found
- [x] 3.10 Test: Restoring a version id that belongs to a different note returns not found

**Modified capability `notes`** (`backend/tests/notes.test.ts`) — 7 of the 8 scenarios below
already exist and are behaviorally unchanged by this ticket; confirm they still pass rather than
rewriting them:

- [x] 3.11 Confirm existing: Partial update applies only the provided fields still passes
- [x] 3.12 Confirm existing: Update with no fields rejected still passes
- [x] 3.13 Confirm existing: Update creates a version snapshot of the prior state still passes
- [x] 3.14 Confirm existing: Updating a note not owned by the caller returns not found still
      passes
- [x] 3.15 Confirm existing: Providing tagIds replaces the note's tag set still passes
- [x] 3.16 Confirm existing: Providing an empty tagIds array clears all tags still passes
- [x] 3.17 Confirm existing: tagIds referencing a tag not owned by the caller is rejected still
      passes
- [x] 3.18 Test: Version history beyond 50 is automatically purged

- [x] 3.19 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend exec vitest run --coverage` → 101/101 green. Coverage: 92.49%
      stmts/92.43% lines overall; `NoteService.ts` 100%, `VersionService.ts` 100% (both
      confirmed via raw coverage-final.json — the text-summary table's printed rows omitted
      these two files, same v8-reporter display quirk noted in AB-1007/AB-1008) — well above
      the 80% bar

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1009-version-history`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1009 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
