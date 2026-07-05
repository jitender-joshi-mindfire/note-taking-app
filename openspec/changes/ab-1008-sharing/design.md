## Context

`backend/prisma/schema.prisma` has no `ShareLink` model yet — SDS Section 3 describes the target
schema but no ticket has migrated it (same situation `Tag` was in before AB-1006 and
`searchVector` was in before AB-1007). Unlike those two, this migration is fully expressible in
native Prisma (no `Unsupported` types, no triggers) — a standard model with a one-to-one relation.

Existing patterns this design reuses rather than reinventing: `AuthService.issueRefreshToken`'s
token generation (`randomBytes(32).toString("base64url")`, in `lib/hash.ts` as
`generateRefreshToken`) is byte-for-byte what SDS Section 7 specifies for share tokens too — no
new crypto code needed. `NoteService`'s ownership-scoped `findFirst` pre-check pattern (used by
`updateNote`) is reused for the two owner-authenticated share endpoints. `AuthService.refresh`'s
atomic conditional-claim pattern (`updateMany` with a `WHERE` guard, checking `result.count`)
is reused for the view-count increment (Decision 1).

**Context7 note**: Context7 MCP has been unavailable all session. `prisma.shareLink.upsert` on a
one-to-one relation and the atomic conditional `updateMany` + `increment` combination are
flagged as risks to verify empirically at the Core Implementation checkpoint, same discipline as
every prior ticket.

## Goals / Non-Goals

**Goals:**
- Add the `ShareLink` model (FRS 7.1–7.4) and its full lifecycle: generate, revoke, public
  view, atomic view count.
- Wire `DELETE /notes/:id` to also revoke the note's active share link (FRS 4.4.4).
- Expose the owner's view count via the note's own retrieval responses (FRS 7.4.2, per `/spec`).

**Non-Goals:**
- No frontend work (AB-1014).
- No email/notification on share or expiry.
- No configurable token length or expiry-extension endpoint — regenerate-to-extend only, per
  `/spec`.

## Decisions

### Decision 1: Atomic conditional increment, not check-then-increment

A naive `findUnique` (check validity) followed by a separate `update` (increment) leaves a race
window: the link could expire or be revoked between the two calls, incrementing `viewCount` for
a view that shouldn't have counted. Instead, `viewSharedNote` does the validity check and the
increment in one atomic step:
```ts
const claim = await prisma.shareLink.updateMany({
  where: { token, revokedAt: null, expiresAt: { gt: now } },
  data: { viewCount: { increment: 1 } },
});
```
If `claim.count === 0`, the token was invalid at that exact instant (by construction, not by a
stale read) — a follow-up read then classifies *why* (unknown/revoked → 404, otherwise expired →
410) purely for error-message purposes, with no further write. This mirrors
`AuthService.refresh`'s existing atomic-claim-then-classify pattern in this codebase.

**Alternative considered**: `findUnique` then `update` — rejected as the exact race class this
project has repeatedly closed elsewhere (AB-1002's refresh-token reuse race, this ticket's own
view-count requirement explicitly asking for "no lost updates under concurrent access").

### Decision 2: Regenerate via `upsert`, not delete+insert

FRS 7.1.3 says a new link "replaces" the existing one. `/spec` clarified this means a fresh
token and a reset view count, indistinguishable in effect from a delete-then-recreate — but a
`prisma.shareLink.upsert({ where: { noteId }, create: {...}, update: { token, expiresAt,
viewCount: 0, revokedAt: null } })` achieves the exact same observable behavior (new token, new
expiry, `viewCount` back to 0, `revokedAt` cleared even if the previous link had been revoked)
in a single atomic statement, without a separate delete step or a transaction.

**Alternative considered**: transactionally delete the existing row and insert a new one —
rejected as strictly more complex for identical observable behavior; `upsert` is simpler and
equally atomic.

### Decision 3: Share URL built from a new `APP_BASE_URL` env var, not request context

SDS's `POST /notes/:id/share` response includes a `url` field. Building it from
`req.protocol`/`req.get("host")` inside the route handler would work, but would also require
threading request context into `NoteService.toNoteSummary` (which also needs to build this same
URL for the note's embedded `shareLink` field, per FRS 7.4.2/`/spec`) — `toNoteSummary` has no
request context today and adding it would mean changing its signature, which `SearchService.ts`
(AB-1007) also calls.

**Chosen approach**: a new `APP_BASE_URL` environment variable (`backend/.env.example`,
`.env`, `.env.test`), read once in a small `backend/src/lib/shareUrl.ts` helper:
```ts
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
export function buildShareUrl(token: string): string {
  return `${APP_BASE_URL}/api/share/${token}`;
}
```
Used identically by `ShareService.generateShareLink` and `NoteService.toNoteSummary` — no
signature changes needed anywhere. The URL points at the actual working `GET /api/share/:token`
endpoint (not a not-yet-existing frontend route), so it's genuinely functional today; AB-1014
(frontend) may want to point this at a frontend page instead once one exists — noted as a
follow-up, not a gap in this ticket.

**Alternative considered**: build the URL from request context (`req.protocol` + `req.get
("host")`) — rejected because it would force `toNoteSummary` to accept request context, coupling
a pure data-shaping function to HTTP concerns, for a codebase that currently keeps that function
request-agnostic (reused by both `notes.ts` and `search.ts` routes).

### Decision 4: A note's embedded `shareLink` field is `null` for expired-but-not-yet-revoked links

FRS 4.4.4 explicitly wires note deletion to revocation, but nothing revokes a link purely because
it expired (SDS's public-access check already treats expiry and revocation as equally
link-invalidating, but the *row* itself isn't touched on expiry — there's no cron/cleanup job in
this project's scope). Rather than have the owner's own `GET /notes/:id` show a technically-dead
expired link as if it were live, `toNoteSummary` treats a link as "active" (and therefore
non-null) only if `revokedAt === null AND expiresAt > now` — matching the same
validity check `viewSharedNote` uses for public access, so the owner's view of "do I have a
share link" is never out of sync with what the public endpoint would actually honor.

**Alternative considered**: show the link regardless of expiry, with an `expired` boolean flag —
rejected as an API shape not specified anywhere in SDS/FRS/the approved spec delta; `null` is
simpler and matches the spec's literal "active share link, if any" wording.

## Shared Schemas (`packages/shared`)

**New file `packages/shared/src/sharing.ts`:**
```ts
import { z } from "zod";

export const generateShareLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365),
});

export type GenerateShareLinkInput = z.infer<typeof generateShareLinkSchema>;

export interface ShareLinkSummary {
  token: string;
  url: string;
  expiresAt: string;
}

export interface ShareLinkRef extends ShareLinkSummary {
  viewCount: number;
}

export interface PublicNoteView {
  title: string;
  content: string;
  updatedAt: string;
}
```

**Modified `packages/shared/src/notes.ts`:** `NoteSummary` gains
`shareLink: ShareLinkRef | null` (imported from `./sharing.js`).

## Backend Changes

**New `backend/src/lib/shareUrl.ts`:** `buildShareUrl(token)` per Decision 3.

**New `backend/src/services/ShareService.ts`:**
- `generateShareLink(userId, noteId, expiresInDays)` → ownership pre-check (reusing
  `NoteService`'s exported `NoteNotFoundError`), `prisma.shareLink.upsert` (Decision 2), returns
  `ShareLinkSummary`.
- `revokeShareLink(userId, noteId)` → ownership pre-check, `updateMany({ where: { noteId,
  revokedAt: null }, data: { revokedAt: new Date() } })`, `count === 0` → new
  `ShareLinkNotFoundError`.
- `viewSharedNote(token)` → Decision 1's atomic claim-then-classify, returns `PublicNoteView`.
  New `ShareLinkExpiredError` for the 410 case.

**Modified `backend/src/routes/notes.ts`:** add `POST /:id/share` and `DELETE /:id/share` to the
existing `notesRouter` (already `requireAuth`-gated) — reuses the router rather than a new
mount, since these are owner-authenticated sub-resources of a note, not a standalone capability
surface.

**New `backend/src/routes/share.ts`:** `GET /:token`, public, no `requireAuth` — per
`AGENTS.md`'s standing exception list (`/api/share/:token` and `/api/auth/*` are the only
unauthenticated routes).

**Modified `backend/src/app.ts`:** mount `shareRouter` at `/api/share`.

**Modified `backend/src/services/NoteService.ts`:**
- `toNoteSummary` maps `shareLink` per Decision 4; `createNote` passes `shareLink: null`
  explicitly (a brand-new note can't have one yet).
- `listNotes`/`getNote`/`updateNote`'s Prisma calls add `include: { shareLink: true }` alongside
  the existing `include: { tags: true }`.
- `deleteNote` becomes a `prisma.$transaction`: the existing ownership-scoped `updateMany`
  (soft-delete), then an unconditional `shareLink.updateMany({ where: { noteId, revokedAt: null
  }, data: { revokedAt: new Date() } })` — this naturally no-ops if there's no active link, no
  separate existence check needed (FRS 4.4.4).

## Database Migration

- Add `ShareLink` model (per SDS Section 3, verbatim) and `shareLink ShareLink?` on `Note`.
  Standard Prisma migration — no `Unsupported` types, no triggers, no hand-editing expected
  (to be confirmed at the Foundation checkpoint; if Prisma's generated DDL is incomplete for any
  reason, hand-edit following the AB-1006/1007 precedent).
- **Backward compatible**: purely additive.
- Apply to both dev and test databases (same two-step process as AB-1006/1007), then
  `pnpm --filter backend prisma:generate`.
- Add `APP_BASE_URL="http://localhost:3000"` to `backend/.env.example`, `.env`, and `.env.test`.

## docs/SDS.md Updates (part of this change)

- Section 5's Sharing API contract table is already accurate (matches this design exactly) — no
  change needed there.
- Add a one-line note to the Notes API contract area (near the existing `tags` field note added
  by AB-1006) documenting that note responses also include `shareLink`.

## Risks / Trade-offs

- **[Risk]** `prisma.shareLink.upsert` on a one-to-one relation and the atomic conditional
  `updateMany` + `increment` pattern are unverified against live docs (Context7 unavailable) →
  **Mitigation**: manual smoke test at the Core Implementation checkpoint — generate, regenerate
  (confirm reset), revoke, view (confirm increment), expire (confirm 410, confirm no increment),
  concurrent-view (confirm no lost updates) — before writing automated tests.
- **[Trade-off]** `viewSharedNote`'s success path costs two queries (the atomic claim, then a
  read for the note content) instead of one → accepted; correctness (never incrementing an
  invalid link) outweighs the marginal cost, consistent with this project's established
  priorities.
- **[Risk]** `APP_BASE_URL` is a new, previously-undocumented env var → **Mitigation**: added to
  `.env.example` with a sensible dev default; not a secret, safe to default rather than require.
- **[Trade-off]** An expired-but-unrevoked link's row lingers in the DB indefinitely (no cleanup
  job) → accepted, matches FRS's scope (no purge/cleanup job requirement for share links,
  unlike the 30-day soft-delete recovery window's noted-but-out-of-scope purge job for notes).
