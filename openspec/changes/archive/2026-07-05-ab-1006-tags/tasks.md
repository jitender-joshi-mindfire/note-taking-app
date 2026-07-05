## 1. Foundation

- [x] 1.1 Add `packages/shared/src/tags.ts`: `hexColorSchema`, `createTagSchema`,
      `updateTagSchema`, and the `TagRef`/`TagSummary`/`TagListItem`/`TagListResponse` types
      (design.md Shared Schemas); export from `packages/shared/src/index.ts`
- [x] 1.2 Update `packages/shared/src/notes.ts`: add `tagIds` to `listNotesQuerySchema` (union +
      transform to always yield `string[]`, design.md), add `tagIds` to `updateNoteSchema` and
      widen its `.refine(...)` to accept any of `title`/`content`/`tagIds`, add `tags: TagRef[]`
      to `NoteSummary`
- [x] 1.3 Update `backend/prisma/schema.prisma`: add the `Tag` model (`id`, `userId`, `user`
      relation, `name`, `color`, `createdAt`, `notes Tag[] @relation("NoteTags")`,
      `@@index([userId])` — no `@@unique`, per Decision 1), add `tags Tag[] @relation("NoteTags")`
      to `Note`, add `tags Tag[]` to `User`
- [x] 1.4 Generate the migration: `npx prisma migrate dev --schema backend/prisma/schema.prisma
      --name add_tags --create-only`; hand-edit the generated SQL to add
      `CREATE UNIQUE INDEX "Tag_userId_name_ci_key" ON "Tag" ("userId", lower("name"));`
      (Decision 1); apply with `npx prisma migrate dev --schema backend/prisma/schema.prisma`;
      run `pnpm --filter backend prisma:generate` — applied to both the dev and test databases
- [x] 1.5 Add ADR `docs/decisions/0001-tag-name-case-insensitive-uniqueness.md` documenting
      Decision 1 (context, decision, consequences)
- [x] 1.6 Update `docs/SDS.md`: Section 3 (`Tag` model — replace `@@unique([userId, name])` with
      `@@index([userId])` plus a note on the functional-index approach, cross-referencing the
      ADR); Section 5 (`GET /notes`/`GET /notes/:id` responses gain `tags: TagRef[]`,
      `PATCH /notes/:id` request gains optional `tagIds`)
- [x] 1.7 Checkpoint: `packages/shared` builds cleanly in isolation, `pnpm lint --max-warnings 0`
      passes repo-wide, `pnpm --filter backend test` → 43/43 still green. The full-repo
      `pnpm build` does NOT pass yet — `NoteSummary.tags` is now a required field but
      `NoteService.ts` doesn't populate it until task 2.4; this is expected sequencing (a shared
      type change necessarily precedes its consumer) and the full green `pnpm build` checkpoint
      is carried into 2.6 once `NoteService.ts` is updated

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1006 is backend-only (no frontend component; that's AB-1011).

- [x] 2.1 Create `backend/src/services/TagService.ts`: `createTag`, `listTags`, `updateTag`,
      `deleteTag`, with `DuplicateTagNameError` (catch `P2002`) and `TagNotFoundError`
      (design.md Backend Changes)
- [x] 2.2 Create `backend/src/routes/tags.ts`: `POST /`, `GET /`, `PATCH /:id`, `DELETE /:id`,
      mounted with `requireAuth`, mapping `DuplicateTagNameError` → 409 and
      `TagNotFoundError` → 404
- [x] 2.3 Mount `tagsRouter` at `/api/tags` in `backend/src/app.ts`
- [x] 2.4 Update `backend/src/services/NoteService.ts`: `toNoteSummary` maps `tags`; `createNote`
      returns `tags: []`; `listNotes` adds the AND-of-`some` tag filter (Decision 3) and
      `include: { tags: true }`; `getNote` adds `include: { tags: true }`; `updateNote` gains
      `tagIds?: string[]`, in-transaction ownership check, `tags: { set: [...] }`, and throws
      `InvalidTagIdsError` on an invalid/foreign id (Decision 2)
- [x] 2.5 Update `backend/src/routes/notes.ts`: `PATCH /:id` passes `parsed.data.tagIds` through
      to `updateNote` and maps `InvalidTagIdsError` → 400
- [x] 2.6 Checkpoint: `pnpm build` → 0 errors (confirming the orderBy AND `AND`-of-`some` filter
      and `tags: { set }` both type-check cleanly with no assertion needed), `pnpm lint
      --max-warnings 0` clean, `pnpm --filter backend test` → 43/43 still green. Manually
      smoke-tested against the real dev Postgres per design.md's flagged Context7-unverified
      risk: created two tags (one with a color), confirmed case-insensitive duplicate rejection
      (409) via the hand-added functional index, attached both tags to a note via `PATCH`
      (replace-set), confirmed `GET /tags` noteCount became 1 for both, confirmed AND-semantics
      filtering (`?tagIds=a&tagIds=b`) returned exactly that note, confirmed an unknown `tagIds`
      value in the filter returned an empty list with 200 (no error), confirmed an empty
      `tagIds: []` array cleared all tags and noteCount dropped back to 0, confirmed a
      nonexistent `tagIds` value on `PATCH` was rejected with 400 — all behaved exactly as
      designed

## 3. Tests (one per spec scenario)

**New capability `tags`** (new file `backend/tests/tags.test.ts`, 14 scenarios):

- [x] 3.1 Test: Successful tag creation with name only
- [x] 3.2 Test: Successful tag creation with name and color
- [x] 3.3 Test: Duplicate tag name rejected case-insensitively
- [x] 3.4 Test: Empty or over-length tag name rejected
- [x] 3.5 Test: Invalid color format rejected
- [x] 3.6 Test: Listing returns only the caller's own tags
- [x] 3.7 Test: Note count reflects only non-deleted notes currently tagged
- [x] 3.8 Test: Newly created tag appears with a note count of zero
- [x] 3.9 Test: Partial update applies only the provided fields
- [x] 3.10 Test: Update with no fields rejected
- [x] 3.11 Test: Renaming to a name colliding with another of the caller's tags is rejected
- [x] 3.12 Test: Updating a tag not owned by the caller returns not found
- [x] 3.13 Test: Deleting a tag removes it from all notes without deleting the notes
- [x] 3.14 Test: Deleting a tag not owned by the caller returns not found

**Modified capability `notes`** (`backend/tests/notes.test.ts`) — 12 of the 18 scenarios below
already exist from AB-1004/AB-1005 and are behaviorally unchanged by this ticket; confirm they
still pass rather than rewriting them:

- [x] 3.15 Confirm existing: List returns only the caller's own non-deleted notes still passes
- [x] 3.16 Confirm existing: Custom page size is honored up to the maximum still passes
- [x] 3.17 Confirm existing: Page size above the maximum is capped still passes
- [x] 3.18 Confirm existing: Sorting by title ascending still passes
- [x] 3.19 Confirm existing: Unrecognized sortBy value rejected still passes
- [x] 3.20 Confirm existing: Page beyond the last page returns an empty list still passes
- [x] 3.21 Confirm existing: Reading a note not owned by the caller returns not found still
      passes
- [x] 3.22 Confirm existing: Reading a soft-deleted note returns not found still passes
- [x] 3.23 Test: Filtering by tag returns only notes having all specified tags
- [x] 3.24 Test: Filtering by a tag id not owned by the caller returns an empty list
- [x] 3.25 Test: A listed note includes its attached tags
- [x] 3.26 Confirm existing: Partial update applies only the provided fields still passes
- [x] 3.27 Update existing test: Update with no fields rejected — left as-is; sending `{}`
      already correctly covers "none of title/content/tagIds provided" without code changes
- [x] 3.28 Confirm existing: Update creates a version snapshot of the prior state still passes
- [x] 3.29 Confirm existing: Updating a note not owned by the caller returns not found still
      passes
- [x] 3.30 Test: Providing tagIds replaces the note's tag set
- [x] 3.31 Test: Providing an empty tagIds array clears all tags
- [x] 3.32 Test: tagIds referencing a tag not owned by the caller is rejected

- [x] 3.33 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend exec vitest run --coverage` → 63/63 green. Coverage: 91.26%
      stmts/91.24% lines overall; `NoteService.ts` 100%, `TagService.ts` 90.9%, `tags.ts` routes
      92.5% — well above the 80% bar for new code

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1006-tags`
- [x] 4.2 Update `docs/TICKETS.md` AB-1006 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
