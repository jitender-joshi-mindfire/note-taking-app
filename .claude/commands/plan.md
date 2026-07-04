Create the technical design for: $ARGUMENTS

Steps:

1. Read `openspec/changes/$ARGUMENTS/proposal.md`.
2. Read `openspec/changes/$ARGUMENTS/specs/**/*.md` (the approved spec delta — this is the
   contract; do not deviate from it here).
3. Read `docs/SDS.md` (architecture decisions, DB schema, API contracts) — the design MUST
   conform to it exactly. If the ticket requires something SDS.md doesn't cover, flag it as an
   open question rather than inventing a new convention silently.
4. Read `AGENTS.md` and the relevant domain `CLAUDE.md`.
5. Scan the existing codebase for reusable patterns (existing services, middleware, components)
   before proposing new ones.
6. Run `openspec instructions design --change $ARGUMENTS` and follow its output exactly to write
   `openspec/changes/$ARGUMENTS/design.md`, covering:
   - Exact file paths to create/modify
   - TypeScript interfaces / Zod schemas (final shapes, matching SDS contracts — note if any go
     in `packages/shared`)
   - Key technical decisions with rationale, and alternatives considered
   - DB changes and whether they are backward compatible
   - Reuse of existing shared code
   - Risks/trade-offs and an explicit build + lint + test checkpoint plan
7. Run `openspec validate $ARGUMENTS` — must pass.
8. Ask `[y/n]` before writing `design.md`.
9. Wait for explicit human approval before running `/tasks`.

Format: `/plan AB-1042-user-registration`
