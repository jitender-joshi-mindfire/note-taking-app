## Context

Every feature area has isolated backend (Vitest+Supertest) and frontend (Vitest+Testing
Library) coverage, but nothing runs the real Vite dev server against the real Express server
against a real Postgres database in an actual browser. `@playwright/test` is already a root
devDependency (added at project scaffolding, unused until now). AGENTS.md/SDS.md Section 10
both call for exactly one Playwright journey: register → note → tag → search → share → version
history.

Two frontend gaps surfaced while researching this design (both pre-existing, neither introduced
by this ticket, neither fixed here):
- No UI exists to create a tag or attach one to a note (only filtering by existing tags does).
- No frontend page renders a publicly shared note — the share link resolves to a backend JSON
  endpoint (`GET /api/share/:token`), confirmed by reading `AppRoutes.tsx`.

Both are worked around at the test-setup/verification level (API seeding, HTTP-level
verification) rather than blocking this ticket — see proposal.md's Impact section.

## Goals / Non-Goals

**Goals:**
- One sequential Playwright test exercising the real UI through all six journey steps against a
  real backend, frontend, and Postgres database.
- Full isolation from any other locally-running instance of this app (dev servers, dev
  database) — the suite must be safe to run alongside `pnpm dev:backend`/`pnpm dev:frontend`
  without port or data conflicts, and without ever touching the real dev database.
- No production code changes — this ticket only adds tests.

**Non-Goals:**
- Building the missing tag-creation/attachment UI or a public shared-note viewer page (both
  disclosed gaps, flagged as follow-ups).
- CI workflow wiring to run this suite automatically on PRs (not requested; a separate concern).
- Testing failure/edge cases per feature (already covered by each ticket's own unit/component
  tests) — this is a single happy-path journey, not a second full test suite.

## Decisions

### Decision 1: Dedicated ports (3200 backend / 5273 frontend), not the normal dev ports
`playwright.config.ts`'s `webServer` array boots the backend on `PORT=3200` and the frontend on
`--port 5273`, instead of the normal 3000/5173. Rationale: this session has repeatedly hit a
stray `kubectl port-forward` from an unrelated project squatting port 3000 — using dedicated
ports sidesteps that conflict entirely, and also means the suite can run even while a developer
already has `pnpm dev:backend`/`pnpm dev:frontend` running normally on 3000/5173, without a port
clash.
**Alternative considered**: reuse 3000/5173 with `reuseExistingServer: true` so local runs reuse
an already-started dev server — rejected because that dev server would be pointed at the real
dev database, defeating the test-database isolation goal below (Decision 2), and would inherit
whatever port-3000 conflict happens to be live at the time.

### Decision 2: Backend `webServer` targets the existing `.env.test` database, not the dev one
The backend `webServer` entry sets `env: { PORT: "3200", DOTENV_CONFIG_PATH: ".env.test" }`.
Verified against dotenv's own docs (Context7 MCP was not available this session; verified via
`https://github.com/motdotla/dotenv` instead): the `dotenv/config` preload module — which is
exactly how `backend/src/index.ts` loads env (`import "dotenv/config"`) — reads
`DOTENV_CONFIG_PATH` from the environment to choose which file to load, and dotenv's default
"never overwrite an already-set variable" behavior means `.env.test`'s own `PORT=3000` line is
skipped in favor of the `PORT=3200` Playwright already injected into the spawned process's
environment. Net effect: the backend boots on port 3200 against the same real, migrated
`note_taking_app_test` Postgres database the Vitest+Supertest backend tests already use — no new
database, no new provisioning step, and the real dev database is never touched by this suite.
**Found during implementation**: `.env.test`'s `APP_BASE_URL=http://localhost:3000` is also used
server-side to build share links (`buildShareUrl`), independent of `PORT` — without overriding
it too, generated share links pointed at the wrong port and step 5 (Decision 7) failed. Added
`APP_BASE_URL: "http://localhost:3200"` alongside `PORT` in the same `env` block.

**Alternative considered**: a dedicated third database just for E2E — rejected as unnecessary
duplication; reusing `.env.test`'s database is safe because every run registers a brand-new,
randomly-emailed user (Decision 4), so runs never collide with each other's or the backend
suite's leftover data (all of it is scoped by `userId`).

### Decision 3: Frontend `webServer` sets `VITE_API_BASE_URL` as a process env var, not by editing `.env`
The frontend `webServer` entry sets `env: { VITE_API_BASE_URL: "http://localhost:3200/api" }`.
Verified against Vite's own docs (`https://vite.dev/guide/env-and-mode`): environment variables
already present in the process environment when Vite starts take precedence over `.env` file
contents. This means the suite never edits `frontend/.env` — unlike the manual-smoke-testing
workaround used repeatedly in AB-1014/AB-1015 (edit `.env` to point at a temporary backend port,
then remember to restore it afterward), which was a real, recurring friction point in this
session. Playwright's `webServer.env` avoids that class of mistake entirely for this suite.

### Decision 4: A fresh, randomly-generated user registered through the real UI each run
The journey's very first step generates a unique email (e.g. a timestamp/random suffix) and
registers through `RegisterPage`'s real form. No seeded/fixed account, no cleanup step needed
between runs — isolation comes from every run's data being scoped to a brand-new `userId`.

### Decision 5: Tag and second fixture note seeded via Playwright's `request` API context, reusing the UI-created user's own access token
Since no frontend UI can create or attach a tag, the journey extracts the just-registered user's
`accessToken` via `page.evaluate(() => localStorage.getItem("note-app-session"))` (the exact key
`authStorage.ts` uses) and parses out the token, then uses Playwright's `request` fixture with
an `Authorization: Bearer <token>` header to call `POST /api/tags` (create the tag) and `PATCH
/api/notes/:id` (attach it, via `tagIds`) directly against the backend — reusing the *same* user
created via the UI, not a second account. The journey also creates one throwaway, untagged
second note via `POST /api/notes` purely as a fixture, so the tag-filter step's "excludes notes
without that tag" assertion has something real to exclude. This is a standard Playwright
pattern (use the API to set up state the UI can't create, use the UI to verify the read path
that matters) — not a statement that the missing tag UI doesn't matter, see proposal.md's
disclosed follow-up.
**Alternative considered**: seed via a second, separately-registered "admin" user or a raw
Prisma script — rejected; reusing the journey's own user's token keeps the test data trivially
scoped to one account and avoids adding any new seeding infrastructure (raw DB scripts) beyond
what `request` + the existing REST API already provide.

### Decision 6: Version history step selects by the first edit's distinctive title text, not by list position or an assumed count
Reading `backend/src/services/NoteService.ts` directly: `createNote` snapshots the just-created
state as a version in the same transaction, and `updateNote` snapshots the note's *pre-update*
state as a version before applying the new one. So "create, then edit twice" produces **three**
retained version rows — [creation state, creation state again (snapshotted right before the
first edit applies), first-edit state (snapshotted right before the second edit applies)] — not
two, and the live/current state (the second edit's content) is not itself a version until a
further save happens. The journey gives its first edit a distinctive, unique title (e.g.
"Journey first revision — `<run id>`") and, in the History modal, selects the list entry whose
title matches that exact text — not "the second item" or "the earlier of two" — so the test
stays correct regardless of the exact version count or backend retention internals.
**Alternative considered**: assert an exact version count and pick by list index — rejected;
this was the original (incorrect) `/spec`-time assumption, corrected here after reading the
actual snapshot logic. Selecting by known, unique title text is robust to implementation
details the E2E test shouldn't need to know precisely.

### Decision 7: Share-link public access verified via an unauthenticated HTTP request, not a browser page load
`buildShareUrl` returns `http://localhost:3200/api/share/:token` (with the E2E port override
from Decision 1) — a backend JSON endpoint, not a frontend route (confirmed: no `/share/:token`
route exists in `AppRoutes.tsx`). The journey generates the link through `ShareModal`'s real UI,
reads the displayed URL text, then uses Playwright's `request` fixture (no `Authorization`
header, i.e. genuinely unauthenticated) to `GET` that URL directly and asserts a `200` response
whose JSON body contains the note's current title and content.
**Alternative considered**: `page.goto(shareUrl)` in a fresh incognito-style browser context and
assert on rendered text — rejected; a raw JSON response renders inconsistently across browser
engines (Chromium's built-in JSON viewer wraps the payload in extra DOM structure that shifts
between versions), making DOM-text assertions on it needlessly fragile compared to reading the
HTTP response body directly.

### Decision 8: One sequential `test()` in `e2e/journey.spec.ts`, plus a small `e2e/helpers.ts`
Matches AGENTS.md/SDS.md's literal "one full user journey" wording and the `/spec`-time
decision: all six steps run in order inside one `test()`, sharing one authenticated `page`. A
separate `e2e/helpers.ts` holds small, non-test utility functions (unique-email generation,
reading the stored access token, the authenticated-`request` tag/note-seeding calls) — these are
plain functions, not additional test cases, so they don't conflict with "one journey, one test."
This intentionally supersedes AGENTS.md's general "one test per FRS/spec scenario" convention
for this ticket specifically, per AGENTS.md's own E2E-specific line ("Playwright, one full user
journey") and the explicit `/spec`-time decision — each of the six spec scenarios above is
covered by assertions *within* the single test, not by six separate `test()` blocks.

### Decision 9: `e2e/` is a plain directory, not a pnpm workspace package
`@playwright/test` is already a root devDependency. `playwright.config.ts` lives at the repo
root with `testDir: "./e2e"`. No `package.json`/`tsconfig.json` is added under `e2e/`, and
`pnpm-workspace.yaml` is not modified — disproportionate setup for a single spec file plus one
helpers file.

## File Paths

- **New**: `playwright.config.ts` (root) — `webServer` array (backend + frontend, per Decisions
  1–3), `testDir: "./e2e"`, `use: { baseURL: "http://localhost:5273" }` (required whenever
  `webServer` is an array, per Playwright's docs).
- **New**: `e2e/helpers.ts` — `uniqueEmail()`, `getAccessToken(page)`, `seedTagOnNote(request,
  accessToken, noteId, tagName)`, `seedUntaggedNote(request, accessToken)`.
- **New**: `e2e/journey.spec.ts` — the single `test()`.
- **No changes** to any backend, frontend, or `packages/shared` source file.

## Risks / Trade-offs

- **[Risk]** Booting two dev servers adds real wall-clock time to every run (cold Vite/tsx
  startup). → **Mitigation**: accepted — this is a single, occasional E2E run, not part of the
  fast inner unit-test loop; `webServer.timeout` is set generously (30s each) to avoid flaky
  false-negative startup failures on a slower machine.
- **[Risk]** The `.env.test` database must already exist and be migrated (the same
  precondition the existing Vitest+Supertest backend suite already relies on) — this ticket
  doesn't add its own migration/provisioning step. → **Mitigation**: accepted as an existing,
  already-relied-upon precondition, not a new one; documented in `e2e/journey.spec.ts`'s file
  header comment for anyone running it fresh.
- **[Risk]** TipTap's `EditorContent` renders a real ProseMirror `contenteditable` div, not a
  plain `<textarea>` — Playwright's `fill()` doesn't work on it (same constraint already
  documented for jsdom-based component tests). → **Mitigation**: use `locator.click()` +
  `page.keyboard.type(...)` for the note body, matching how a real user types into it.

## Checkpoint Plan

- After `playwright.config.ts` + `e2e/helpers.ts`: `pnpm build` → 0 errors, `pnpm lint
  --max-warnings 0` (ESLint's flat config must not choke on `e2e/` — verify it lints cleanly or
  is appropriately included), `pnpm test` → all still green (no Vitest changes).
- After `e2e/journey.spec.ts`: run `npx playwright test` locally end-to-end at least twice in a
  row (confirming no leftover state from run 1 breaks run 2, validating Decision 4's isolation
  claim), plus a deliberate failure-path sanity check (temporarily break one assertion to confirm
  the suite actually fails rather than silently passing).
- Final: `pnpm build`, `pnpm lint --max-warnings 0`, `pnpm test` (Vitest suites unaffected), `npx
  playwright test` green.
