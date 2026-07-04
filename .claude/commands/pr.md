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
6. Generate the commit message:
   ```
   feat(scope): description AB#ticket

   - bullet 1
   - bullet 2

   Relates to AB#XXXX
   ```
7. Ask: "Run `git add .` && `git commit`? [y/n]"
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
   Reviewers: @team-lead
   ```
9. Ask: "Run `git push`? [y/n]"

PR description MUST list every FRS requirement covered and every spec scenario tested (no
exceptions — this is required, not optional, for review).

Format: `/pr AB-1042-user-registration`
