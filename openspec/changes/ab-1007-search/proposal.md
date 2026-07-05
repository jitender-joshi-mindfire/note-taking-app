## Why

FRS Section 6 requires full-text search across a user's own notes with keyword highlighting, using
PostgreSQL's native full-text search (no external search service, per this project's fixed tech
stack). No search capability exists today — this ticket introduces it.

## What Changes

- **`GET /search`**: full-text search across the authenticated user's own, non-deleted notes'
  `title` and `content` (FRS 6.1.1, 6.1.2), using PostgreSQL `websearch_to_tsquery` (natural user
  input — quotes, `-exclude`, etc. — with no tsquery syntax knowledge required, per SDS Section 6).
- **Highlighted snippets** (FRS 6.2.1): each result includes a `snippet` built from `content` via
  `ts_headline` with matches wrapped in `<mark>…</mark>`. Highlighting is scoped to `content`
  only — `title` is returned as plain text (decided during `/spec` clarification; matches SDS
  Section 6's `ts_headline` usage literally).
- **Fixed relevance ordering** (per SDS Section 6): results are ordered by `ts_rank` descending,
  ties broken by `updatedAt` descending. `GET /search` does NOT accept `sortBy`/`sortDir` —
  overriding relevance ranking would defeat the purpose of full-text search (decided during
  `/spec` clarification).
- **Pagination** (FRS 6.3.1): same convention as note listing — `page`/`pageSize`, response
  envelope `{ items, total, page, pageSize }`.
- **`searchVector` column + trigger** (first use of SDS Section 3's previously-undeployed design):
  a generated `tsvector` column on `Note` (title weighted `A`, content weighted `B`), maintained
  by a Postgres `AFTER INSERT OR UPDATE` trigger created via raw SQL migration (Prisma cannot
  express generated tsvector columns or triggers natively) — this was flagged as an accepted,
  not-yet-implemented architecture decision in SDS Section 12 and is implemented now.
- **Out of scope for this ticket** (decided during `/spec` clarification): combining search with
  tag filtering (`tagIds`, from AB-1006) — FRS Section 6 doesn't mention it, and it's a
  meaningful scope expansion better handled as its own follow-up if ever required.

## Capabilities

### New Capabilities
- `search`: full-text search across the caller's own non-deleted notes, with highlighted
  snippets and pagination, per FRS 6.1, 6.2, 6.3.

### Modified Capabilities
(none — this is purely additive; no existing `notes` or `tags` requirement changes)

## Impact

- **DB migration required**: adds a `searchVector` generated column to `Note` plus a maintaining
  trigger and a GIN index, via raw SQL (first raw-SQL migration since the schema was scaffolded;
  precedent already documented in SDS Section 3 and Section 12's open decisions list).
  Backward compatible — purely additive, no existing column changes.
- **New backend code**: `backend/src/services/SearchService.ts`, `backend/src/routes/search.ts`,
  registered under `/api/search` in `backend/src/app.ts`.
- **New shared code**: `packages/shared/src/search.ts` (`searchQuerySchema`,
  `SearchResultItem`/`SearchResponse` types).
- **No changes to NoteService or TagService** — search reads via a dedicated raw SQL query
  against `searchVector`, not through the existing Prisma `note.findMany` path (Prisma cannot
  express `ts_rank`/`ts_headline` natively; SDS Section 6 already anticipates raw SQL here).
- **`docs/decisions/` ADR**: documents the tsvector-trigger migration approach, resolving one of
  SDS Section 12's three flagged open architecture decisions.
- **No frontend changes** — search UI is AB-1013.
