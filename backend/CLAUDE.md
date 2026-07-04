# backend/CLAUDE.md

Backend-specific rules. Read alongside the root `CLAUDE.md` and `AGENTS.md`.

## Commands

- `pnpm --filter backend dev` (or `pnpm dev:backend` from root) — watch mode
- `pnpm --filter backend typecheck` — `tsc --noEmit`
- `pnpm --filter backend test` — Vitest + Supertest
- `pnpm --filter backend prisma:generate` — regenerate the Prisma client after a schema change
- `npx prisma migrate dev --schema backend/prisma/schema.prisma` — create/apply a migration

## Framework Patterns

- Express 5, ESM throughout (`import`, not `require`).
- Route handlers stay thin: parse/validate with a Zod schema from `packages/shared`, delegate
  business logic to a service function, map the result to an HTTP response.
- Every authenticated route uses the `requireAuth` middleware — never re-implement token
  verification inline in a route.
- All Prisma writes that must stay consistent (e.g. update + version snapshot, share-link view
  increment) run inside `prisma.$transaction`.
- Raw SQL is only for the `tsvector` trigger migration — application queries always go through
  the Prisma client.

## Anti-Patterns to Avoid

- Do not read-then-write a counter (e.g. share link views) — use Prisma's atomic `increment`.
- Do not return a different status for "not found" vs. "not yours" — both are 404.
- Do not put Zod schemas or shared types directly in `backend/src` — they belong in
  `packages/shared`.
- Do not log secrets, passwords, tokens, or OTP values anywhere except the explicit OTP
  dev-console line described in `docs/SDS.md` Section 4.
