Run OpenSpec proposal creation for: $ARGUMENTS

Steps:

1. Run `openspec list` to see current active changes.
2. Read `openspec/specs/` (current system state) for any capability this ticket touches or
   modifies.
3. Read `docs/FRS.md` → find the exact numbered requirements this ticket implements.
4. Read `docs/SDS.md` → find the relevant design decisions (schema, API contracts) this ticket
   must conform to.
5. Read `AGENTS.md` and the relevant domain `CLAUDE.md` for constraints.
6. Ask clarifying questions — minimum 3, maximum 8. Do not guess at ambiguous requirements;
   these questions catch bugs before a single line of code is written.
7. If `openspec/changes/$ARGUMENTS/` does not exist yet, run:
   `openspec new change $ARGUMENTS --description "<one-line ticket summary>"`
8. Run `openspec instructions proposal --change $ARGUMENTS` and follow its output exactly to
   write `openspec/changes/$ARGUMENTS/proposal.md`. Every capability/spec delta MUST trace to a
   numbered FRS requirement — cite the requirement IDs in the proposal.
9. Run `openspec instructions specs --change $ARGUMENTS` and follow its output exactly to write
   the scenario delta file(s) at `openspec/changes/$ARGUMENTS/specs/<capability>/spec.md`
   (ADDED/MODIFIED/REMOVED, `#### Scenario:` with exactly 4 hashtags, WHEN/THEN format).
10. Run `openspec validate $ARGUMENTS` — must pass before continuing.
11. Show the generated `proposal.md` and spec delta in full.
12. Do NOT proceed to `/plan` or write any implementation code.

Ask `[y/n]` before writing `proposal.md` or any spec delta file.

Format: `/spec AB-1042-user-registration`
