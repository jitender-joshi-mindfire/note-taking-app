## 1. Foundation

- [ ] 1.1 Add `packages/shared/src/sharing.ts`: `generateShareLinkSchema`, `ShareLinkSummary`,
      `ShareLinkRef`, `PublicNoteView` (design.md Shared Schemas); export from
      `packages/shared/src/index.ts`
- [ ] 1.2 Update `packages/shared/src/notes.ts`: add `shareLink: ShareLinkRef | null` to
      `NoteSummary`
- [ ] 1.3 Update `backend/prisma/schema.prisma`: add the `ShareLink` model (per SDS Section 3,
      verbatim) and `shareLink ShareLink?` on `Note`
- [ ] 1.4 Generate the migration: `npx prisma migrate dev --schema backend/prisma/schema.prisma
      --name add_share_link`; confirm it's a standard, fully-Prisma-generated migration (no
      hand-editing expected this time — no `Unsupported` types or triggers involved); apply to
      both the dev and test databases; run `pnpm --filter backend prisma:generate`
- [ ] 1.5 Add `APP_BASE_URL="http://localhost:3000"` to `backend/.env.example`, `backend/.env`,
      and `backend/.env.test`
- [ ] 1.6 Update `docs/SDS.md`: add a one-line note near the existing `tags`-field note (added by
      AB-1006) documenting that note responses also include a `shareLink` field
- [ ] 1.7 Checkpoint: `packages/shared` builds cleanly in isolation, `pnpm lint --max-warnings 0`
      passes repo-wide, `pnpm --filter backend test` → still green. The full-repo `pnpm build`
      is NOT expected to pass yet — `NoteSummary.shareLink` is now required but
      `NoteService.ts` doesn't populate it until task 2.3 (same expected sequencing gap as
      AB-1006's Phase 1); the full green `pnpm build` checkpoint carries into 2.7

## 2. Core Implementation

No `[PARALLEL]` tasks — AB-1008 is backend-only (no frontend component; that's AB-1014).

- [ ] 2.1 Create `backend/src/lib/shareUrl.ts`: `buildShareUrl(token)` per design.md Decision 3
- [ ] 2.2 Create `backend/src/services/ShareService.ts`: `generateShareLink` (Decision 2,
      `upsert`), `revokeShareLink`, `viewSharedNote` (Decision 1, atomic
      claim-then-classify); reuses `NoteService`'s exported `NoteNotFoundError` for the
      ownership-scoped endpoints; new `ShareLinkNotFoundError` and `ShareLinkExpiredError`
- [ ] 2.3 Update `backend/src/services/NoteService.ts`: `toNoteSummary` maps `shareLink` per
      Decision 4 (null unless `revokedAt === null AND expiresAt > now`); `createNote` passes
      `shareLink: null`; `listNotes`/`getNote`/`updateNote` add `include: { shareLink: true }`
      alongside the existing `tags: true`; `deleteNote` becomes a `prisma.$transaction`
      revoking the note's active share link in the same operation (FRS 4.4.4)
- [ ] 2.4 Update `backend/src/routes/notes.ts`: add `POST /:id/share` and `DELETE /:id/share` to
      the existing `notesRouter` (already `requireAuth`-gated)
- [ ] 2.5 Create `backend/src/routes/share.ts`: `GET /:token`, public, no `requireAuth`
- [ ] 2.6 Mount `shareRouter` at `/api/share` in `backend/src/app.ts`
- [ ] 2.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green. Also manually smoke-test against the real dev Postgres per design.md's flagged
      Context7-unverified risks: generate a link (confirm token/url/expiresAt), regenerate
      (confirm new token, view count reset to 0, old token now 404s), view it publicly (confirm
      content returned, view count increments), revoke it (confirm 404 on subsequent public
      view), manually set an `expiresAt` in the past via `psql` and confirm 410 with no
      increment, confirm cross-user 404s on generate/revoke, confirm deleting a note with an
      active link revokes it (subsequent public view 404s)

## 3. Tests (one per spec scenario)

**New capability `sharing`** (new file `backend/tests/sharing.test.ts`, 14 scenarios):

- [ ] 3.1 Test: Successful link generation for a note with no existing link
- [ ] 3.2 Test: Generating a link for a note not owned by the caller returns not found
- [ ] 3.3 Test: expiresInDays out of bounds rejected
- [ ] 3.4 Test: Generating a new link replaces the existing one
- [ ] 3.5 Test: Owner revokes their active share link
- [ ] 3.6 Test: Revoking when no active link exists returns not found
- [ ] 3.7 Test: Revoking a link for a note not owned by the caller returns not found
- [ ] 3.8 Test: Valid link returns the note read-only without authentication
- [ ] 3.9 Test: Unknown token returns not found
- [ ] 3.10 Test: Expired token returns gone
- [ ] 3.11 Test: Revoked token returns not found
- [ ] 3.12 Test: Each successful public view atomically increments the view count
- [ ] 3.13 Test: The owner sees the current view count via the note's response
- [ ] 3.14 Test: An unsuccessful view attempt does not increment the view count

**Modified capability `notes`** (`backend/tests/notes.test.ts`) — 14 of the 18 scenarios below
already exist from AB-1004/1005/1006 and are behaviorally unchanged by this ticket; confirm they
still pass rather than rewriting them:

- [ ] 3.15 Confirm existing: List returns only the caller's own non-deleted notes still passes
- [ ] 3.16 Confirm existing: Custom page size is honored up to the maximum still passes
- [ ] 3.17 Confirm existing: Page size above the maximum is capped still passes
- [ ] 3.18 Confirm existing: Sorting by title ascending still passes
- [ ] 3.19 Confirm existing: Unrecognized sortBy value rejected still passes
- [ ] 3.20 Confirm existing: Page beyond the last page returns an empty list still passes
- [ ] 3.21 Confirm existing: Reading a note not owned by the caller returns not found still
      passes
- [ ] 3.22 Confirm existing: Reading a soft-deleted note returns not found still passes
- [ ] 3.23 Confirm existing: Filtering by tag returns only notes having all specified tags still
      passes
- [ ] 3.24 Confirm existing: Filtering by a tag id not owned by the caller returns an empty list
      still passes
- [ ] 3.25 Confirm existing: A listed note includes its attached tags still passes
- [ ] 3.26 Test: A note without an active share link has a null shareLink
- [ ] 3.27 Test: A note with an active share link includes it
- [ ] 3.28 Confirm existing: Delete sets deletedAt instead of removing the row still passes
- [ ] 3.29 Confirm existing: Soft-deleted notes disappear from list and detail endpoints still
      passes
- [ ] 3.30 Confirm existing: Deleting a note not owned by the caller returns not found still
      passes
- [ ] 3.31 Test: Deleting a note revokes its active share link

- [ ] 3.32 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
      `pnpm test --coverage` → all green, ≥80% coverage on new code

## 4. Archive

- [ ] 4.1 Run `openspec archive ab-1008-sharing`
- [ ] 4.2 Update `docs/TICKETS.md` AB-1008 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
