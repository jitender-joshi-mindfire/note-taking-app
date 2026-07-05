# 0001. Tag name case-insensitive uniqueness via a hand-added functional index

Date: 2026-07-05
Status: accepted

## Context

FRS 5.1.2 requires tag names be unique per user, case-insensitively (`"Work"` and `"work"` are
the same tag). Prisma's `@@unique(...)` attribute can only express a plain, case-sensitive
constraint — it has no way to target `lower(name)` declaratively in `schema.prisma`.

## Decision

`schema.prisma` declares `name String` on `Tag` with no `@@unique` attribute. The migration
(`20260705160809_add_tags`) hand-adds a raw SQL functional unique index instead:
```sql
CREATE UNIQUE INDEX "Tag_userId_name_ci_key" ON "Tag" ("userId", lower("name"));
```
`TagService.createTag`/`updateTag` rely on this constraint firing (caught as Prisma error code
`P2002`) as the sole source of truth for duplicate detection — the same pattern already used for
duplicate-email detection in `AuthService.register`, chosen specifically because an earlier,
app-level check-then-act version of that same email-uniqueness logic was caught by review as
racy. Relying on the DB constraint closes that race by construction.

Alternatives considered: a Postgres `citext` column (would let `@@unique` work natively, but
enabling a Postgres extension via Prisma's `postgresqlExtensions` preview feature is a bigger,
less-reversible change for one field); an app-level pre-check (rejected outright as the exact
race pattern already fixed elsewhere in this codebase).

## Consequences

- Future schema changes to `Tag` must remember this index isn't expressed in `schema.prisma` —
  `prisma migrate diff`/`db push` won't recreate it if the migration history is ever reset
  outside of `prisma migrate reset` (which replays committed migration files and is therefore
  safe).
- Any code creating or renaming a tag must go through a path that catches `P2002`, rather than
  assuming Prisma-level type safety alone prevents duplicates.
