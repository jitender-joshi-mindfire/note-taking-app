Prepare PR for: $ARGUMENTS

Steps:

1. Run, in order (fix any failures before proceeding — never proceed past a failing gate):
   - `pnpm build` → 0 errors, 0 warnings
   - `pnpm lint --max-warnings 0`
   - `pnpm test --coverage` → all green
   - `npx commitlint --from HEAD~1`
2. Confirm `openspec archive $ARGUMENTS` has already run (it should have, at the end of
   `/implement`) — the change must be under `openspec/archive/`, not `openspec/changes/`. If it
   is still under `changes/`, run `openspec archive $ARGUMENTS` now.
3. Confirm `/review $ARGUMENTS` was run in a fresh terminal and returned all ✅.
4. Run `git diff main --stat`.
5. Read `openspec/archive/$ARGUMENTS/proposal.md` and `openspec/archive/$ARGUMENTS/specs/**/*.md`.
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
