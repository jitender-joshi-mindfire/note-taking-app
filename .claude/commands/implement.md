Implement: $ARGUMENTS

$ARGUMENTS is the ticket ID. Look up its `OpenSpec Change` column in `docs/TICKETS.md` first —
use that kebab-case name for every `openspec` command and file path below.

Before writing one line of code, read:

1. `AGENTS.md`
2. `docs/FRS.md` (business rules for this feature)
3. `docs/SDS.md` (API contracts, DB schema, design decisions)
4. The relevant domain `CLAUDE.md` (`backend/`, `frontend/`, and/or `packages/shared/`)
5. `openspec/changes/<change-name>/proposal.md`
6. `openspec/changes/<change-name>/design.md`
7. `openspec/changes/<change-name>/tasks.md`

Rules:

- Ask `[y/n]` before every file write — never write silently.
- Work through `tasks.md` phase by phase, checking off each `- [ ]` as it's completed.
- After every phase: `pnpm build` (0 errors) → `pnpm lint --max-warnings 0` → `pnpm test` (all
  green). Never proceed past a failing checkpoint.
- Write tests before or alongside implementation, never after. Never skip a failing test —
  fix the root cause.
- If a task is estimated to take longer than 45 minutes, delegate it to a sub-agent. Never use a
  `session-context.md` file as a workaround.
- If context usage hits ~70%, run `/compact` immediately — never wait for it to fill.
- Verify every library/API call against live docs via Context7 MCP before using it — no
  hallucinated methods.
- When every phase is complete and all checkpoints are green, run
  `openspec archive <change-name>` and update `docs/TICKETS.md`'s status for this ticket.

Output when done:

## Files Changed + why
## Spec Scenarios Covered (scenario → test name)
## FRS Requirements Covered (requirement ID → implementation)
## Assumptions Made
## Follow-up Tasks

Format: `/implement AB-1042-user-registration`
