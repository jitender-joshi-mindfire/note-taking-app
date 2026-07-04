# packages/shared/CLAUDE.md

## What Exists Here

Currently just an empty barrel (`src/index.ts`). As tickets land, this package will hold:

- Zod schemas for every API request/response body (registration, login, note CRUD, tags,
  search, sharing, versions).
- TypeScript types inferred from those Zod schemas (`z.infer<...>`) — do not hand-write a
  parallel `interface`/`type` for anything that already has a schema.
- Small framework-agnostic utilities shared by both apps (e.g. pagination helpers), if any
  emerge — do not add React- or Express-specific code here.

## Rule: Never Duplicate What's Already Here

If a type or validation rule exists in `packages/shared`, import it — do not redefine it in
`backend` or `frontend`, even partially. If the existing shape doesn't quite fit, extend or
compose it here rather than forking it locally.

## How to Add a New Shared Item

1. Add the Zod schema (and/or type) under `packages/shared/src/`, grouped by feature
   (e.g. `src/notes.ts`, `src/auth.ts`).
2. Export it from `packages/shared/src/index.ts`.
3. Import it in `backend`/`frontend` via `@note-taking-app/shared`.
4. Run `pnpm --filter @note-taking-app/shared build` to confirm it compiles before relying on it
   elsewhere.
