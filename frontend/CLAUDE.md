# frontend/CLAUDE.md

Frontend-specific rules. Read alongside the root `CLAUDE.md` and `AGENTS.md`.

## Commands

- `pnpm --filter frontend dev` (or `pnpm dev:frontend` from root) — Vite dev server
- `pnpm --filter frontend typecheck` — `tsc --noEmit`
- `pnpm --filter frontend test` — Vitest + Testing Library
- `pnpm --filter frontend build` — production build

## Component & State Patterns

- Server data (notes, tags, search results, share links, versions) is fetched and cached with
  TanStack Query — never copied into Zustand or component state.
- Zustand holds only local/UI state (e.g. editor draft-dirty flag, active modal) that has no
  server representation.
- UI primitives come from shadcn/ui; add new components via the shadcn CLI rather than
  hand-rolling equivalents.
- The note editor is TipTap; editor content is treated as an opaque JSON blob passed to/from the
  backend — do not parse or transform it outside the editor layer.
- Forms validate with the same Zod schemas from `packages/shared` that the backend uses — never
  hand-write a parallel validation rule.

## Anti-Patterns to Avoid

- Do not fetch data with `useEffect` + manual state — use TanStack Query.
- Do not define a local TypeScript interface that duplicates a shape already in
  `packages/shared`.
- Do not hand-roll a button/input/dialog when a shadcn/ui equivalent exists.
- Do not store the access token anywhere persistent (e.g. `localStorage`) beyond what the SDS's
  auth design calls for — follow `docs/SDS.md` Section 4 exactly.
