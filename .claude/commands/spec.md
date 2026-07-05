Run OpenSpec proposal creation for: $ARGUMENTS

The ticket ID alone (e.g. `AB-1002`) carries no meaning — `docs/TICKETS.md` is what maps it to
an actual scope and FRS sections. Always resolve the ticket there first.

Steps:

1. Read `docs/TICKETS.md` → find this ticket's row. If it's not listed there, STOP and ask the
   user for the ticket's scope before doing anything else — do not guess or invent one.
2. Run `openspec list` to see current active changes.
3. Read `openspec/specs/` (current system state) for any capability this ticket touches or
   modifies.
4. Read `docs/FRS.md` → the exact FRS sections listed for this ticket in `docs/TICKETS.md`.
5. Read `docs/SDS.md` → find the relevant design decisions (schema, API contracts) this ticket
   must conform to.
6. Read `AGENTS.md` and the relevant domain `CLAUDE.md` for constraints.
7. Ask clarifying questions — minimum 3, maximum 8. Do not guess at ambiguous requirements;
   these questions catch bugs before a single line of code is written.
8. OpenSpec requires a lowercase kebab-case change name — `$ARGUMENTS` (e.g. `AB-1002`) will be
   rejected as-is. Derive a change name as `<lowercase-ticket-id>-<short-descriptive-slug>`
   (e.g. `ab-1002-user-auth`). If `openspec/changes/<change-name>/` does not exist yet, run:
   `openspec new change <change-name> --description "<one-line ticket summary from docs/TICKETS.md>"`
9. Run `openspec instructions proposal --change <change-name>` and follow its output exactly to
   write `openspec/changes/<change-name>/proposal.md`. Every capability/spec delta MUST trace to
   a numbered FRS requirement — cite the requirement IDs in the proposal.
10. Run `openspec instructions specs --change <change-name>` and follow its output exactly to
    write the scenario delta file(s) at `openspec/changes/<change-name>/specs/<capability>/spec.md`
    (ADDED/MODIFIED/REMOVED, `#### Scenario:` with exactly 4 hashtags, WHEN/THEN format).
11. Run `openspec validate <change-name>` — must pass before continuing.
12. Show the generated `proposal.md` and spec delta in full.
13. Update this ticket's row in `docs/TICKETS.md`: set `Status` to `In progress` and record
    `<change-name>` in the `OpenSpec Change` column — this is the only place the ticket ID ↔
    OpenSpec change name mapping is durably recorded, and `/plan`, `/tasks`, `/implement`,
    `/review`, and `/pr` all depend on it.
14. Do NOT proceed to `/plan` or write any implementation code.

Ask `[y/n]` before writing `proposal.md` or any spec delta file.

Format: `/spec AB-1042-user-registration`
