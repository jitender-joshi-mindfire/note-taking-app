## 1. Foundation

- [x] 1.1 Add `packages/shared/src/sharing.ts`: `generateShareLinkSchema`, `ShareLinkSummary`,
      `ShareLinkRef`, `PublicNoteView` (design.md Shared Schemas); export from
      `packages/shared/src/index.ts`
- [x] 1.2 Update `packages/shared/src/notes.ts`: add `shareLink: ShareLinkRef | null` to
      `NoteSummary`
- [x] 1.3 Update `backend/prisma/schema.prisma`: add the `ShareLink` model (per SDS Section 3,
      verbatim) and `shareLink ShareLink?` on `Note`
- [x] 1.4 Generate the migration: `npx prisma migrate dev --schema backend/prisma/schema.prisma
      --name add_share_link`. **Real gap caught**: Prisma's auto-generated migration included a
      `DROP INDEX "Note_searchVector_idx"` — it treats AB-1007's hand-added GIN index (on an
      `Unsupported` column) as drift to remove, since nothing in `schema.prisma` declares it.
      Removed that line before applying (replaced with an explanatory comment warning this will
      recur on every future migration touching this schema). Applied to both dev and test
      databases; verified via `psql` that `Note_searchVector_idx` survived in both; ran
      `pnpm --filter backend prisma:generate`
- [x] 1.5 Added `APP_BASE_URL="http://localhost:3000"` to `backend/.env.example`,
      `backend/.env`, and `backend/.env.test`
- [x] 1.6 Updated `docs/SDS.md`: added a note directly below the existing `tags`-field note (from
      AB-1006) documenting the `shareLink` field
- [x] 1.7 Checkpoint: `packages/shared` builds cleanly in isolation, `pnpm lint --max-warnings 0`
      passes repo-wide, `pnpm --filter backend test` → 73/73 still green. The full-repo
      `pnpm build` does not pass yet — `NoteSummary.shareLink` is required but `NoteService.ts`
      doesn't populate it until task 2.3 (same expected sequencing gap as AB-1006's Phase 1);
      carries into 2.7

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1008 is backend-only (no frontend component; that's AB-1014).

- [x] 2.1 Create `backend/src/lib/shareUrl.ts`: `buildShareUrl(token)` per design.md Decision 3
- [x] 2.2 Create `backend/src/services/ShareService.ts`: `generateShareLink` (Decision 2,
      `upsert`), `revokeShareLink`, `viewSharedNote` (Decision 1, atomic
      claim-then-classify); reuses `NoteService`'s exported `NoteNotFoundError` for the
      ownership-scoped endpoints; new `ShareLinkNotFoundError` and `ShareLinkExpiredError`
- [x] 2.3 Update `backend/src/services/NoteService.ts`: `toNoteSummary` maps `shareLink` per
      Decision 4 (null unless `revokedAt === null AND expiresAt > now`); `createNote` passes
      `shareLink: null`; `listNotes`/`getNote`/`updateNote` add `include: { shareLink: true }`
      alongside the existing `tags: true`; `deleteNote` becomes a `prisma.$transaction`
      revoking the note's active share link in the same operation (FRS 4.4.4). Also updated
      `SearchService.ts` (AB-1007) to add the same `shareLink: true` include, since it also
      calls the now-changed `toNoteSummary`
- [x] 2.4 Update `backend/src/routes/notes.ts`: add `POST /:id/share` and `DELETE /:id/share` to
      the existing `notesRouter` (already `requireAuth`-gated)
- [x] 2.5 Create `backend/src/routes/share.ts`: `GET /:token`, public, no `requireAuth`
- [x] 2.6 Mount `shareRouter` at `/api/share` in `backend/src/app.ts`
- [x] 2.7 Checkpoint: `pnpm build` → 0 errors (after fixing the expected ripple into
      `SearchService.ts`), `pnpm lint --max-warnings 0` clean, `pnpm --filter backend test` →
      73/73 still green. Manually smoke-tested against the real dev Postgres per design.md's
      flagged risks: generated a link (confirmed token/url/expiresAt, and the note's own
      `shareLink` field appearing with `viewCount: 0`), confirmed `expiresInDays` bounds reject
      0 and 400, viewed it publicly with no auth header (confirmed content returned, view count
      incremented to 1, then 2 on a second view), confirmed an unknown token 404s, revoked it
      (confirmed subsequent public view 404s, and the note's own `shareLink` became `null`),
      regenerated a link (confirmed a new token distinct from the old one, view count reset to
      0, old token immediately 404s), manually set `expiresAt` in the past via `psql` and
      confirmed 410 with the owner's `shareLink` field showing `null`, confirmed deleting a note
      with an active link revokes it (subsequent public view 404s), confirmed cross-user 404s on
      both generate and revoke — every behavior matched the design exactly

## 3. Tests (one per spec scenario)

**New capability `sharing`** (new file `backend/tests/sharing.test.ts`, 14 scenarios):

- [x] 3.1 Test: Successful link generation for a note with no existing link
- [x] 3.2 Test: Generating a link for a note not owned by the caller returns not found
- [x] 3.3 Test: expiresInDays out of bounds rejected
- [x] 3.4 Test: Generating a new link replaces the existing one
- [x] 3.5 Test: Owner revokes their active share link
- [x] 3.6 Test: Revoking when no active link exists returns not found
- [x] 3.7 Test: Revoking a link for a note not owned by the caller returns not found
- [x] 3.8 Test: Valid link returns the note read-only without authentication
- [x] 3.9 Test: Unknown token returns not found
- [x] 3.10 Test: Expired token returns gone
- [x] 3.11 Test: Revoked token returns not found
- [x] 3.12 Test: Each successful public view atomically increments the view count
- [x] 3.13 Test: The owner sees the current view count via the note's response
- [x] 3.14 Test: An unsuccessful view attempt does not increment the view count

**Modified capability `notes`** (`backend/tests/notes.test.ts`) — 14 of the 18 scenarios below
already exist from AB-1004/1005/1006 and are behaviorally unchanged by this ticket; confirm they
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
- [x] 3.23 Confirm existing: Filtering by tag returns only notes having all specified tags still
      passes
- [x] 3.24 Confirm existing: Filtering by a tag id not owned by the caller returns an empty list
      still passes
- [x] 3.25 Confirm existing: A listed note includes its attached tags still passes
- [x] 3.26 Test: A note without an active share link has a null shareLink
- [x] 3.27 Test: A note with an active share link includes it
- [x] 3.28 Confirm existing: Delete sets deletedAt instead of removing the row still passes
- [x] 3.29 Confirm existing: Soft-deleted notes disappear from list and detail endpoints still
      passes
- [x] 3.30 Confirm existing: Deleting a note not owned by the caller returns not found still
      passes
- [x] 3.31 Test: Deleting a note revokes its active share link

- [x] 3.32 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm --filter backend exec vitest run --coverage` → 90/90 green. Coverage: 92.37%
      stmts/92.32% lines overall; `NoteService.ts` 100%, `ShareService.ts` 100% (confirmed via
      raw coverage-final.json — the text-summary table's printed rows omitted this file, same
      v8-reporter display quirk noted in AB-1007), `routes/share.ts` 91.66% — well above the
      80% bar

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1008-sharing`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1008 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
