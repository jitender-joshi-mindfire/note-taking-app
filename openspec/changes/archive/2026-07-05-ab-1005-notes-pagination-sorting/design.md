## Context

`GET /notes` (AB-1004) already returns the full `{ items, total, page, pageSize }` envelope with
hardcoded defaults (page 1, page size 20, sorted `updatedAt desc`). This ticket makes those
values configurable via query parameters — no response-shape change, purely widening what the
existing envelope's values can be.

## Goals / Non-Goals

**Goals:**
- Implement configurable pagination and sorting exactly per the spec delta (8 scenarios).

**Non-Goals:**
- Tag filtering (`tagIds` query param) — FRS 4.6, deferred to AB-1006 since `Tag` doesn't exist.
- Any change to `POST /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id` —
  untouched by this ticket.

## Decisions

### 1. Page size above the maximum is silently clamped, not rejected with 400
**Decision:** `pageSize` values above 100 are capped to 100 server-side rather than causing a
validation error. Zod validates shape (`page`/`pageSize` are positive integers) but does NOT
enforce the 100 ceiling — that's a value-clamping business rule applied in `NoteService.ts`,
not a request-shape validation concern.
**Alternative considered:** Reject `pageSize > 100` with 400 via Zod's `.max(100)`. Rejected —
this is a much stricter posture than most REST APIs take for pagination limits (e.g. GitHub's
API silently caps rather than erroring), and nothing in FRS 4.5.1 ("a sane default and maximum")
implies exceeding it should be a client error rather than a server-enforced ceiling. Capping is
friendlier: a client that doesn't know the max still gets a usable, bounded response instead of
an error to handle.

### 2. Sort field is a Zod enum, not free-text validated against a hardcoded list
**Decision:** `sortBy` uses `z.enum(["createdAt", "updatedAt", "title"])`; an unrecognized value
fails Zod validation and returns 400 with a field-level error — consistent with how every other
validation failure in this codebase is reported (`validationError` shape).
**Alternative considered:** Accept any string and silently fall back to the default sort if
unrecognized. Rejected per `/spec` clarification — explicit rejection matches this project's
established pattern (weak password, empty PATCH body) of surfacing bad input rather than
guessing intent.

### 3. Out-of-range page requires no special-case code
**Decision:** Requesting a page beyond the available data needs no explicit handling — Prisma's
`skip`/`take` naturally return an empty array when `skip` exceeds the row count, and `total`
still reflects the true count. The spec scenario is satisfied by the pagination math itself, not
by an added branch.
**Alternative considered:** Explicitly check `page * pageSize > total` and return an error or a
clamped page number. Rejected — unnecessary complexity for behavior Prisma already provides
correctly, and "an empty page is fine" is the least surprising response to a client that
requested a page number it wasn't sure existed.

### 4. Dynamic `orderBy` built from validated, narrow input — not raw user strings
**Decision:** Since `sortBy` is constrained to exactly the 3 literal values Prisma's
`NoteOrderByWithRelationInput` accepts for this model, `{ [sortBy]: sortDir }` is safe to pass
directly to Prisma — there is no injection risk (Zod's enum guarantees one of 3 known strings
reaches this point, never arbitrary client input).

## File Paths to Create

- `packages/shared/src/notes.ts` — **modify**: add `listNotesQuerySchema`
  (`page`, `pageSize`, `sortBy`, `sortDir`, each with a Zod default)
- `backend/src/services/NoteService.ts` — **modify**: `listNotes` accepts
  `{ page, pageSize, sortBy, sortDir }`, clamps `pageSize` to 100, builds `orderBy` dynamically
- `backend/src/routes/notes.ts` — **modify**: `GET /` parses `req.query` through
  `listNotesQuerySchema` before calling `listNotes`
- `backend/tests/notes.test.ts` — **modify**: add 8 tests, one per spec scenario (5 new list
  tests, plus the 2 not-found scenarios and the default-list scenario already exist from AB-1004
  and are preserved as-is per the MODIFIED requirement's full content)

## TypeScript Interfaces / Zod Schemas (packages/shared/src/notes.ts additions)

```typescript
export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).default(20),
  sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
```

## DB Changes

None — pagination/sorting use the existing `Note` table and its existing columns via Prisma
`orderBy`/`skip`/`take`. No new migration.

## Reuse of Existing Shared Code

- `validationError` (`backend/src/lib/validation.ts`, extracted during AB-1004) — reused for the
  invalid-`sortBy` 400 response, no new error-formatting code needed.
- `toNoteSummary` (`NoteService.ts`, from AB-1004) — reused unchanged for mapping list items.

## Risks / Trade-offs

- **[Risk] `orderBy: { [sortBy]: sortDir }`'s computed-property type may not satisfy Prisma's
  exact `NoteOrderByWithRelationInput` shape without an explicit type assertion** → Mitigation:
  low risk since `sortBy` is Zod-narrowed to exactly the 3 valid literal keys before reaching
  Prisma; verify during `/implement` whether TypeScript accepts this directly or needs a
  targeted assertion, and prefer the assertion over `any` if one is needed.
- **[Risk] Silently clamping `pageSize` (Decision 1) could surprise a client expecting an error**
  → Mitigation: accepted, matches common REST convention; the response's `pageSize` field always
  reflects the actual (possibly clamped) value used, so a client inspecting the response can
  detect the clamp happened.

## Migration Plan

None — no schema change, no data migration. Purely additive query-parameter support on an
existing endpoint.

## Open Questions

None outstanding — all `/spec` clarifying questions were resolved with recommended defaults
before this design was written.
