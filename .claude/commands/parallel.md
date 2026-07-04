Set up parallel worktrees for: $ARGUMENTS

Use this when `openspec/changes/$ARGUMENTS/tasks.md` has two or more tasks marked `[PARALLEL]`.
Frontend and backend work must run in **separate git worktrees** — never interleaved in one
working tree (CLAUDE.md, Parallel Work rule).

Steps:

1. Read `openspec/changes/$ARGUMENTS/tasks.md` and list every `[PARALLEL]` task, grouped by
   domain (`backend`, `frontend`, `packages/shared`).
2. If there is only one domain group, stop — there is nothing to parallelize; continue in the
   current session instead.
3. For each domain group, propose a worktree + branch pair:
   - `git worktree add ../note-taking-app-$ARGUMENTS-backend -b feature/backend/$ARGUMENTS`
   - `git worktree add ../note-taking-app-$ARGUMENTS-frontend -b feature/frontend/$ARGUMENTS`
4. Ask `[y/n]` before creating each worktree.
5. In each new worktree, remind the developer to run `pnpm install` (pnpm's global store makes
   this fast — it does not re-download packages) before opening a Claude Code session there.
6. Report the worktree paths and, for each, which `[PARALLEL]` tasks from `tasks.md` belong to
   it. Instruct the developer to open a separate terminal per worktree, run `claude`, then
   `/start`, then work only that worktree's subset of tasks.
7. Do NOT run `/implement` from this session for the parallelized tasks — that happens inside
   each worktree.
8. Once all parallel worktrees finish their tasks and are pushed/merged back into the ticket
   branch, resume the original `/implement $ARGUMENTS` session for any remaining sequential
   phases (tests, archive).
9. After merging, clean up: `git worktree remove ../note-taking-app-$ARGUMENTS-backend` (repeat
   per worktree) — ask `[y/n]` before removing.

Format: `/parallel AB-1042-user-registration`
