# Tickets

The fixed build order for this project. Build strictly in this order — no skipping, no
reordering. `/spec <ticket-id>` reads this file first to know what a ticket ID actually means —
the ID itself (`AB-xxxx`) carries no meaning on its own; this file is the mapping.

Each row: ticket ID, one-line scope, the `docs/FRS.md` sections it implements, domain, status,
linked GitHub issue, and the OpenSpec change name (OpenSpec requires lowercase kebab-case, so
this is NOT the same string as the ticket ID — filled in once `/spec` actually creates the
change; `—` means not started yet).

| Ticket | Scope | FRS Sections | Domain | Status | Issue | OpenSpec Change |
|---|---|---|---|---|---|---|
| AB-1001 | Project setup — monorepo, Prisma, CLAUDE.md files, agents, skills, MCPs | — (infra) | infra | Done | [#1](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/1) | — (predates OpenSpec usage) |
| AB-1002 | Auth — register, login, logout, JWT + refresh token | 3.1, 3.2, 3.3, 3.5 | backend | Done ([#18](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/18) merged) | [#3](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/3) | `ab-1002-user-auth` (archived: `openspec/changes/archive/2026-07-04-ab-1002-user-auth/`) |
| AB-1003 | Auth — forgot password + OTP reset | 3.4, 3.5 | backend | Done ([#19](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/19) merged) | [#4](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/4) | `ab-1003-password-reset` (archived: `openspec/changes/archive/2026-07-05-ab-1003-password-reset/`) |
| AB-1004 | Notes — full CRUD + soft delete | 4.1, 4.2, 4.3, 4.4 (except 4.4.4, deferred to AB-1008) | backend | Done ([#20](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/20) merged) | [#5](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/5) | `ab-1004-notes-crud` (archived: `openspec/changes/archive/2026-07-05-ab-1004-notes-crud/`) |
| AB-1005 | Notes — pagination, sorting, tag filtering | 4.5 (only — 4.6 deferred to AB-1006) | backend | Done ([#21](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/21) merged) | [#6](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/6) | `ab-1005-notes-pagination-sorting` (archived: `openspec/changes/archive/2026-07-05-ab-1005-notes-pagination-sorting/`) |
| AB-1006 | Tags — CRUD + note count per tag | 5.1, 5.2, 4.6 (deferred from AB-1005 — Tag didn't exist yet) | backend | Done ([#22](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/22) merged) | [#7](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/7) | `ab-1006-tags` (archived: `openspec/changes/archive/2026-07-05-ab-1006-tags/`) |
| AB-1007 | Search — full-text with highlight + pagination | 6.1, 6.2, 6.3 | backend | Done ([#23](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/23) merged) | [#8](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/8) | `ab-1007-search` (archived: `openspec/changes/archive/2026-07-05-ab-1007-search/`) |
| AB-1008 | Sharing — generate link, revoke, public access, atomic view count | 7.1, 7.2, 7.3, 7.4, 4.4.4 (deferred from AB-1004 — ShareLink didn't exist yet) | backend | Done ([#24](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/24) merged) | [#9](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/9) | `ab-1008-sharing` (archived: `openspec/changes/archive/2026-07-05-ab-1008-sharing/`) |
| AB-1009 | Version history — snapshot, list, view, restore, auto-purge | 8.1, 8.2, 8.3, 8.4, 8.5 | backend | Done ([#25](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/25) merged) | [#10](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/10) | `ab-1009-version-history` (archived: `openspec/changes/archive/2026-07-05-ab-1009-version-history/`) |
| AB-1010 | Frontend — Auth pages | 3.1, 3.2, 3.3, 3.4 | frontend | Done ([#26](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/26) merged) | [#11](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/11) | `ab-1010-frontend-auth` (archived: `openspec/changes/archive/2026-07-06-ab-1010-frontend-auth/`) |
| AB-1011 | Frontend — Notes list page | 4.2, 4.5, 4.6 | frontend | Done ([#27](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/27) merged) | [#12](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/12) | `ab-1011-notes-list` (archived: `openspec/changes/archive/2026-07-06-ab-1011-notes-list/`) |
| AB-1012 | Frontend — Note editor with TipTap + autosave | 4.1, 4.3 | frontend | Done ([#28](https://github.com/jitender-joshi-mindfire/note-taking-app/pull/28) merged) | [#13](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/13) | `ab-1012-note-editor` (archived: `openspec/changes/archive/2026-07-06-ab-1012-note-editor/`) |
| AB-1013 | Frontend — Search UI with highlights | 6.1, 6.2, 6.3 | frontend | Not started | [#14](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/14) | — |
| AB-1014 | Frontend — Share modal + active links | 7.1, 7.2, 7.3, 7.4 | frontend | Not started | [#15](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/15) | — |
| AB-1015 | Frontend — Version history drawer + restore | 8.1, 8.2, 8.3, 8.4 | frontend | Not started | [#16](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/16) | — |
| AB-1016 | E2E — Playwright full user journey | all (register → note → tag → search → share → version history) | e2e | Not started | [#17](https://github.com/jitender-joshi-mindfire/note-taking-app/issues/17) | — |

## Out of Scope (all tickets)

Do not build, on any ticket, anything from `docs/FRS.md` Section 2.2: real-time collaborative
editing, file/image attachments, a mobile app, OAuth/social login, note folders/nesting, or real
email sending.

## Notes

- "AB" is not an acronym — it's an arbitrary ticket-prefix carried over verbatim from the
  original assignment brief. It has no meaning beyond being this project's ticket ID format.
- Update the `Status` column as tickets complete: `Not started` → `In progress` →
  `PR open (#N)` (implementation + archive done, awaiting review/merge) → `Done` (merged).
  `Done` means merged, not just implemented — `openspec archive` happening before the PR is
  raised (by design, per `/implement`) does not mean the ticket itself is done yet.
