## Context

First feature area outside auth. Consumes `requireAuth` from AB-1002 for the first time. The
`Note` and `NoteVersion` models exist only as an end-state sketch in `docs/SDS.md` Section 3 —
that sketch includes `tags`, `shareLink`, and `searchVector` fields that belong to Tags
(AB-1006), Sharing (AB-1008), and Search (AB-1007) respectively, none of which exist yet.

## Goals / Non-Goals

**Goals:**
- Implement create/read/list/update/soft-delete exactly per the spec delta (13 scenarios).
- Establish the ownership-scoping pattern (`where: { id, userId, deletedAt: null }`) that every
  later Notes-adjacent ticket (tags, search, sharing, version history) will reuse.

**Non-Goals:**
- Pagination/sorting/tag-filtering query parameters — AB-1005.
- Full-text search, the `searchVector` column, and its trigger migration — AB-1007.
- Tag association — AB-1006.
- Share-link revocation on delete (FRS 4.4.4) — AB-1008, once `ShareLink` exists.
- Version history read endpoints (list/view/restore) — AB-1009. This ticket only *writes*
  `NoteVersion` rows; nothing reads them back yet.

## Decisions

### 1. Schema is a deliberate subset of SDS's end-state sketch, not a deviation from it
**Decision:** `Note` in this ticket omits `tags`, `shareLink`, and `searchVector` — those fields
reference models/features that don't exist until AB-1006/1007/1008. `docs/SDS.md`'s schema block
shows the *cumulative* end state across all Notes-related tickets, not what any single ticket
adds. Each of those later tickets will add its own field/relation via its own migration.
**Alternative considered:** Add the fields now as nullable/unused placeholders (e.g. a `Tag[]`
relation with no `Tag` model to point to — not even possible in Prisma) or defer via comments.
Rejected — Prisma can't express a relation to a nonexistent model, and a raw
`Unsupported("tsvector")` column with no trigger populating it would just be dead weight until
AB-1007 anyway. Adding fields exactly when their feature lands is simpler and matches how
AB-1002/1003 already introduced `User`/`RefreshToken`/`PasswordResetOtp` incrementally.

### 2. Ownership + existence + soft-delete checked in one compound query, not sequential checks
**Decision:** Every read/update/delete uses a single Prisma call with
`where: { id, userId, deletedAt: null }` (via `findFirst`/`updateMany`) rather than fetching by
id first and then separately checking `note.userId === userId` and `note.deletedAt === null`.
A no-match result is structurally indistinguishable regardless of *why* it didn't match — wrong
owner, soft-deleted, or truly nonexistent — which directly satisfies FRS 4.2.2's "never leak
existence" requirement by construction, not by careful error-message wording alone.
**Alternative considered:** Fetch by id, then branch on ownership/deletion state with different
log messages internally (still returning 404 externally). Rejected — more code, more chances to
accidentally leak something in a future edit, no benefit over the compound-query approach.

### 3. Update reads prior state, then snapshots + applies in one transaction
**Decision:** `updateNote` first reads the current note (scoped by the same ownership query), then
runs `[create NoteVersion with the OLD values, update Note with the NEW values]` inside one
`prisma.$transaction`, so the snapshot and the change are atomic together — never one without
the other.
**Alternative considered:** Use a single atomic conditional update (like AB-1002's refresh-token
rotation) to avoid the read-then-transact split entirely. Considered but not adopted: unlike
AB-1002's security-sensitive reuse detection, a concurrent double-edit of the same note by its
own owner (this app has no collaborative editing, FRS 2.2) is a low-severity, self-inflicted edge
case — worst case, two near-simultaneous updates could both snapshot the same stale prior state.
Accepted as a documented limitation (see Risks) rather than engineering around a scenario that
doesn't meaningfully occur outside of a single user double-clicking save.

### 4. Extract `validationError` out of `routes/auth.ts` into a shared helper
**Decision:** `routes/auth.ts` has a local, non-exported `validationError()` helper producing the
`{ error: { code: "VALIDATION_ERROR", message, fields } }` shape. `routes/notes.ts` needs the
identical shape. Move it to `backend/src/lib/validation.ts`, export it, update `routes/auth.ts`
to import from there instead of defining its own copy.
**Alternative considered:** Duplicate the function into `routes/notes.ts`. Rejected — exactly the
kind of duplication `AGENTS.md` and `backend/CLAUDE.md` argue against; a shared, tiny, pure
function is the correct fix, not a special case.

### 5. Response envelopes follow SDS's bracket notation literally
**Decision:** Single-note responses (create/get/update) are `{ note: {...} }`; the list response
is `{ items, total, page, pageSize }` (four top-level keys, no wrapping key) — reading
`docs/SDS.md`'s `201 { note }` / `200 { items[], total, page, pageSize }` notation literally,
consistent with how AB-1002's `200 { user, accessToken, refreshToken }` meant three flat
top-level keys, not a wrapper object.

## File Paths to Create

- `backend/prisma/schema.prisma` — **modify**: add `Note`, `NoteVersion` models (per Decision 1's
  scoped subset); add `notes Note[]` to `User`
- `backend/src/lib/validation.ts` — **new**: `validationError()`, moved from `routes/auth.ts`
  (Decision 4)
- `backend/src/routes/auth.ts` — **modify**: import `validationError` from the new shared
  location instead of defining it locally
- `backend/src/services/NoteService.ts` — **new**: `createNote`, `listNotes`, `getNote`,
  `updateNote`, `deleteNote`, `NoteNotFoundError`
- `backend/src/routes/notes.ts` — **new**: wires all 5 endpoints behind `requireAuth`
- `backend/src/app.ts` — **modify**: mount `/api/notes` router
- `packages/shared/src/notes.ts` — **new**: `createNoteSchema`, `updateNoteSchema` (with a
  `.refine` requiring at least one field), `NoteSummary`, `NoteListResponse` types
- `backend/tests/notes.test.ts` — **new**: one test per spec scenario

## TypeScript Interfaces / Zod Schemas (packages/shared/src/notes.ts)

```typescript
export const createNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: "At least one of title or content must be provided",
  });

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export interface NoteSummary {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponse {
  items: NoteSummary[];
  total: number;
  page: number;
  pageSize: number;
}
```

## DB Changes

```prisma
model Note {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  content   String
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  versions  NoteVersion[]

  @@index([userId, deletedAt])
}

model NoteVersion {
  id        String   @id @default(uuid())
  noteId    String
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String
  content   String
  createdAt DateTime @default(now())

  @@index([noteId, createdAt])
}
```

Add `notes Note[]` to `User`. Backward compatible — purely additive, new tables, no existing
data affected.

## Reuse of Existing Shared Code

- `requireAuth` middleware — used by every route in `routes/notes.ts`, unmodified.
- `validationError` — extracted to `backend/src/lib/validation.ts`, used by both `routes/auth.ts`
  and `routes/notes.ts` (Decision 4).
- Error-class-per-failure-mode pattern from `AuthService.ts` — extended with a new
  `NoteNotFoundError` in `NoteService.ts`, following the same shape.

## Risks / Trade-offs

- **[Risk] Concurrent updates to the same note by its owner could both snapshot the same stale
  prior state** (Decision 3) → Mitigation: accepted, low-severity, self-inflicted edge case;
  this app has no collaborative editing (FRS 2.2), so true concurrent edits to one note by
  different actors cannot happen — only a single user's own near-simultaneous requests (e.g. a
  double-click) could trigger it, with no security or data-loss consequence.
- **[Risk] A `deleteNote` call racing an in-flight `updateNote` from the same owner could apply
  the update's `tx.note.update` after `deletedAt` was already set** (the update's final write is
  scoped by `id` only, not re-checked against `deletedAt` — found during `/review`) →
  Mitigation: accepted, same severity class as the risk above (self-inflicted, single-owner-only,
  no cross-user exposure); has no observable effect through any current endpoint since a
  soft-deleted note is 404 everywhere regardless of its `title`/`content`. Would only matter if a
  future ticket (e.g. AB-1009's version history, or a future recovery UI) ever reads a
  soft-deleted row's content directly — worth revisiting the compound-`where` approach then if
  so, not before.
- **[Risk] `content` is stored with zero validation** (per `/spec` clarification) → Mitigation:
  intentional — content is opaque TipTap JSON per `docs/SDS.md`; the backend is not meant to
  understand its structure, matching `frontend/CLAUDE.md`'s "treat as opaque blob" rule.

## Migration Plan

1. Add `Note`, `NoteVersion` models + `User.notes` relation to schema.
2. Run `prisma migrate dev`, apply to both dev and test databases, regenerate client.
3. No rollback complexity — additive migration, no existing data touched.

## Open Questions

None outstanding — all `/spec` clarifying questions were resolved with recommended defaults
before this design was written.
