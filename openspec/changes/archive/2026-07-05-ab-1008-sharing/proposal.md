## Why

FRS Section 7 requires owners to generate revocable, expiring, public read-only links for their
notes with a view counter, and FRS 4.4.4 (explicitly deferred out of AB-1004 because `ShareLink`
didn't exist yet) requires deleting a note to revoke any active share link. No sharing capability
exists today — this ticket introduces the `ShareLink` model and its full lifecycle.

## What Changes

- **New `ShareLink` model** (Prisma migration, per SDS Section 3): one-to-one with `Note`, opaque
  plaintext token (a capability URL, not a credential — per SDS Section 7), `expiresAt`,
  `revokedAt`, `viewCount`.
- **`POST /notes/:id/share`**: only the note's owner can generate a link (FRS 7.1.1); accepts
  `expiresInDays` (integer, 1–365 — decided during `/spec` clarification, FRS doesn't specify a
  range); generating a link for a note that already has one **replaces** it — new token, new
  `expiresAt`, `viewCount` reset to 0 (decided during `/spec`: a regenerated link is a genuinely
  new link, not a rotated one) — the previous token becomes immediately invalid (FRS 7.1.3).
- **`DELETE /notes/:id/share`**: only the owner can revoke their note's active link (FRS 7.2.1),
  immediately invalidating it. Implemented as a soft-revoke (`revokedAt` set, row kept — decided
  during `/spec`, consistent with this project's soft-delete-over-hard-delete convention and
  preserves the link's final view count).
- **`GET /share/:token`** (public, unauthenticated, per SDS Section 4/AGENTS.md's standing
  exception list): returns the note read-only (`title`, `content`, `updatedAt`) if the token is
  valid, non-expired, and non-revoked (FRS 7.3.1). An unknown or revoked token returns 404
  (deliberately indistinguishable, no enumeration); an expired token returns 410 (FRS 7.3.2, per
  SDS Section 9's status code table).
- **Atomic view count** (FRS 7.4.1): every successful public view increments `viewCount` via a
  single atomic DB update (`increment: 1`), never read-then-write — an unsuccessful view
  (unknown/expired/revoked token) does NOT increment the counter.
- **Owner visibility into view count** (FRS 7.4.2): since SDS's existing Sharing API table has no
  GET endpoint for this, the note's own responses (`GET /notes`, `GET /notes/:id`) gain an
  optional `shareLink: { token, url, expiresAt, viewCount } | null` field — decided during
  `/spec`, following the same precedent as AB-1006 adding `tags` to note responses, rather than
  introducing a new endpoint.
- **Deleting a note revokes its share link** (FRS 4.4.4, deferred from AB-1004): `DELETE
  /notes/:id` now also soft-revokes any active `ShareLink` for that note in the same operation.

## Capabilities

### New Capabilities
- `sharing`: generate/revoke public read-only share links with expiry and atomic view counting,
  per FRS 7.1, 7.2, 7.3, 7.4.

### Modified Capabilities
- `notes`: the "Note Retrieval" requirement gains a `shareLink` field on note responses (FRS
  7.4.2); the "Note Soft Delete" requirement gains revoking the note's active share link as part
  of deletion (FRS 4.4.4).

## Impact

- **DB migration required**: adds the `ShareLink` table (one-to-one with `Note`, per SDS Section
  3's already-documented schema — no `Unsupported` types or triggers needed this time, a
  standard Prisma migration). Backward compatible — purely additive.
- **New backend code**: `backend/src/services/ShareService.ts`, `backend/src/routes/share.ts`
  (both the owner-authenticated `/notes/:id/share` routes and the public `/share/:token` route —
  design.md will decide the exact file/route split), registered in `backend/src/app.ts`.
- **Modified backend code**: `backend/src/services/NoteService.ts` (`toNoteSummary` gains
  `shareLink`, `deleteNote` also revokes the active share link).
- **New shared code**: `packages/shared/src/sharing.ts` (`generateShareLinkSchema`,
  `ShareLinkSummary`/`PublicNoteView` types); `packages/shared/src/notes.ts` gains a `shareLink`
  field on `NoteSummary`.
- **`docs/SDS.md` update**: Section 5's Sharing API contract is otherwise already accurate; the
  `note` response shape documentation gains the `shareLink` field.
- **No frontend changes** — share UI is AB-1014.
