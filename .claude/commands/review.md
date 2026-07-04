Review implementation for: $ARGUMENTS

Run this in a **fresh terminal** (new Claude Code instance, clean context) — never reuse the
session that implemented the ticket.

Delegate this entire review to the `reviewer` sub-agent (`.claude/agents/reviewer.md`) — it is
read-only (`Read, Grep, Glob` only, `Write`/`Edit`/`Bash` disallowed) and must not modify any
files.

$ARGUMENTS is the ticket ID. Look up its `OpenSpec Change` column in `docs/TICKETS.md` first
(e.g. `AB-1002` → `ab-1002-user-auth`).

Steps for the sub-agent:

1. Find the archived change with Glob: `openspec/changes/archive/*-<change-name>` (archived
   changes are date-prefixed, e.g. `openspec/changes/archive/2026-07-04-ab-1002-user-auth/` —
   NOT a top-level `openspec/archive/`, and the date can't be predicted in advance, hence the
   glob). Read its `proposal.md`, `specs/**/*.md`, `design.md`, `tasks.md`. If no match is
   found, check `openspec/changes/<change-name>/` instead and flag that archiving has not
   happened yet.
2. Read `docs/FRS.md` (original requirements).
3. Compare the actual implementation against the spec scenarios AND the FRS acceptance criteria
   for this ticket.
4. Output, one line per item:
   - ✅ Implemented: [scenario] → [file:line]
   - ❌ Missing: [scenario]
   - ⚠️ Drifted: [scenario — spec says X, code does Y]
   - 🔒 Security: [concern]
   - 📋 FRS gap: [requirement not addressed]
5. No style feedback — compliance only.

Do not run `/pr` until this output is all ✅ — no ❌, ⚠️, 🔒, or 📋 entries.

Format: `/review AB-1042-user-registration`
