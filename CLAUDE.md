# CLAUDE.md

@AGENTS.md

## Claude Code-Specific Rules

### Spec-Driven Gates (Non-Negotiable)

1. Every ticket MUST have a written spec proposal before any implementation — run
   `/spec AB-xxxx`. No exceptions.
2. The generated spec delta MUST be human-reviewed and approved before running `/plan`.
3. `/plan` MUST be reviewed and approved before `/tasks`. `/tasks` MUST be approved before
   `/implement`.

### Permission Model

- Ask `[y/n]` before EVERY file write — never let Claude write files silently.
- Ask `[y/n]` before: git push, DB migrations, deleting files.
- Proceed without asking: build, test, lint, git add, git commit.

### Context Management

- One ticket per Claude session — run `/clear` between tickets. No exceptions.
- Run `/compact` when context usage hits ~70%. Never wait for context to fill.
- For any task estimated to take longer than 45 minutes, delegate to a sub-agent. Never use a
  `session-context.md` file as a workaround.

### Parallel Work

- For any two tasks marked `[PARALLEL]` in `tasks.md`, use `/parallel` to spin up separate git
  worktrees. Frontend and backend work must run in separate worktrees, never interleaved in one
  working tree.

### Model Selection

- Haiku — boilerplate / mechanical generation.
- Sonnet — standard implementation work (default).
- Opus + ultrathink — architecture decisions only.

### Library Verification

- Context7 MCP must be active at all times. Verify every library/API call against live docs
  before using it — no hallucinated methods allowed.

### Thinking Depth

- Simple tasks: default depth.
- Complex features: "think hard before starting."
- Architecture decisions: "ultrathink" (pairs with Opus — see Model Selection).

### Commit Format

- `feat(scope): description AB#ticket`
- `fix(scope): description AB#ticket`
- `chore(scope): description`
- Enforced by commitlint via the `commit-msg` Husky hook.

### Branch Naming

- `feature/{domain}/AB-{ticket}-{short-name}`
- `fix/{domain}/AB-{ticket}-{short-name}`

## Quality Gates (Non-Negotiable)

### After every phase checkpoint

1. `pnpm build` → 0 errors, 0 warnings
2. `pnpm lint --max-warnings 0`
3. `pnpm test` → all green, ≥80% coverage on new code

Never proceed past a failing checkpoint.

### Before every commit

1. `npx commitlint --from HEAD~1` → must pass
2. Husky pre-commit hook → must pass silently (runs build + lint + test)

### Never commit if:

- Any test is failing
- Lint has errors
- Build has TypeScript errors

## Before Raising a PR

- Run `/review AB-xxxx` in a **fresh terminal** (new Claude instance, clean context) — the
  `reviewer` sub-agent is read-only and checks spec + FRS compliance only, no style feedback.
- `/review` output must be all ✅ — no ❌ missing, ⚠️ drifted, 🔒 security, or 📋 FRS-gap
  findings — before running `/pr`.
- Run `openspec archive AB-xxxx` before raising the PR — the change must move from
  `openspec/changes/` to `openspec/archive/`.
- PR description must list every FRS requirement covered and every spec scenario tested.

## Data & Dependency Rules

- Soft delete means setting `deletedAt` only. Never physically delete a note row within the
  30-day recovery window.
- Pin every dependency version exactly in `package.json`. Never use `@latest` in an install
  command.
