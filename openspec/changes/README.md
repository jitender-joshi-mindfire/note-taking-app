# changes/

Active, in-progress per-ticket proposals (`changes/<kebab-case-name>/` — note OpenSpec requires
lowercase kebab-case, so a ticket like AB-1002 becomes e.g. `ab-1002-user-auth`; the mapping back
to the ticket ID lives in `docs/TICKETS.md`). Each contains `proposal.md`,
`specs/<capability>/spec.md` (delta), `design.md`, and `tasks.md`, created by the `/spec`,
`/plan`, and `/tasks` slash commands in that order.

Once a ticket is complete, `openspec archive <change-name>` moves it to
**`changes/archive/<YYYY-MM-DD>-<change-name>/`** (date-prefixed — NOT a top-level
`openspec/archive/`, despite what you might expect from the folder name alone) and merges its
spec delta into `openspec/specs/<capability>/spec.md` (the current-state source of truth).
Since the date prefix isn't predictable in advance, look it up with:
`find openspec/changes/archive -maxdepth 1 -iname "*<change-name>"`.
