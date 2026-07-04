Prepare PR for: $ARGUMENTS

$ARGUMENTS is the ticket ID. Look up its `OpenSpec Change` column in `docs/TICKETS.md` first
(e.g. `AB-1002` → `ab-1002-user-auth`).

Steps:

1. Run, in order (fix any failures before proceeding — never proceed past a failing gate):
   - `pnpm build` → 0 errors, 0 warnings
   - `pnpm lint --max-warnings 0`
   - `pnpm test --coverage` → all green
   - `npx commitlint --from HEAD~1`
2. Confirm the change is archived (it should be, from the end of `/implement`) — find it with
   `openspec/changes/archive/*-<change-name>` (date-prefixed, e.g.
   `openspec/changes/archive/2026-07-04-ab-1002-user-auth/` — NOT a top-level
   `openspec/archive/`). If it's still under `openspec/changes/<change-name>/` instead, run
   `openspec archive <change-name>` now.
3. Confirm `/review $ARGUMENTS` was run in a fresh terminal and returned all ✅.
4. Run `git diff main --stat`.
5. Read `proposal.md` and `specs/**/*.md` from the archived change directory found in step 2.
6. Look up this ticket's linked GitHub issue number in `docs/TICKETS.md`.
7. Generate the commit message:
   ```
   feat(scope): description AB#ticket

   - bullet 1
   - bullet 2

   Relates to AB#XXXX
   ```
8. Generate the PR description:
   ```
   ## What
   ## FRS Requirements Covered
   ## Spec Artifacts
   ## Checklist
   -[ ] All FRS acceptance criteria implemented
   -[ ] All spec scenarios implemented + tested
   -[ ] Build: 0 errors, 0 warnings
   -[ ] pnpm lint: clean
   -[ ] pnpm test: all pass, coverage ≥80% on new code
   -[ ] commitlint: valid
   -[ ] openspec archive complete
   -[ ] Smoke tested locally

   Closes #<issue-number-from-docs/TICKETS.md>
   ```
9. For this project (note-taking-app), full git autonomy is granted — run `git add .`,
   `git commit`, `git push`, and `gh pr create --title "..." --body "..."` without asking for
   `[y/n]` confirmation first. Report back the commit SHA and PR URL once done. (This is a
   project-specific override — do not assume it applies to other repos.)
10. Update this ticket's `Status` to `Done` in `docs/TICKETS.md` and include that update in the
    same commit.

PR description MUST list every FRS requirement covered and every spec scenario tested (no
exceptions — this is required, not optional, for review).

Format: `/pr AB-1042-user-registration`
