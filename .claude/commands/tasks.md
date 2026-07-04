Break down into tasks for: $ARGUMENTS

$ARGUMENTS is the ticket ID. Look up its `OpenSpec Change` column in `docs/TICKETS.md` first —
use that kebab-case name for every `openspec` command and file path below.

Steps:

1. Read `openspec/changes/<change-name>/proposal.md`.
2. Read `openspec/changes/<change-name>/design.md`.
3. Read `openspec/changes/<change-name>/specs/**/*.md`.
4. Run `openspec instructions tasks --change <change-name>` and follow its output exactly —
   tasks MUST use the `- [ ] X.Y Description` checkbox format (the archive step parses this;
   other formats are silently untracked).
5. Generate a sequenced checklist covering:
   - Phase 1: Foundation (shared types/Zod schemas in `packages/shared`, DB migrations)
   - Phase 2: Core implementation — mark independent tasks `[PARALLEL]` where frontend and
     backend work can proceed in separate git worktrees (see `/parallel`)
   - Phase 3: Tests — exactly one task per spec scenario from the spec delta
   - Phase 4: Archive (`openspec archive <change-name>`) and update `docs/TICKETS.md` status
   - A checkpoint after every phase: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`,
     `pnpm test` → all green
6. Save to `openspec/changes/<change-name>/tasks.md`.
7. Ask `[y/n]` before writing `tasks.md`.
8. Wait for explicit human approval before running `/implement`.

Format: `/tasks AB-1042-user-registration`
