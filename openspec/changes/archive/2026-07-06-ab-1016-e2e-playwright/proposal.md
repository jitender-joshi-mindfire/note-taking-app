## Why

Every feature area (auth, notes, tags, search, sharing, version history) has backend and
frontend test coverage in isolation, but nothing exercises them together through a real browser
against a real running app the way an actual user would. This ticket adds the one end-to-end
regression net AGENTS.md/SDS.md Section 10 call for: a single Playwright journey through
register → note → tag → search → share → version history, catching integration bugs (routing,
auth-token wiring, cross-feature state) that isolated unit/component tests structurally cannot.

## What Changes

- **One sequential Playwright test** (decided during `/spec`): a single `test()` walking through
  all six steps in order, sharing one authenticated browser session — matching AGENTS.md's
  literal "one full user journey" wording. Steps, with the FRS requirements each exercises:
  1. **Register** (FRS 3.1) — a fresh, randomly-generated email each run (no fixed seeded
     account, no cross-run collisions, no manual cleanup needed).
  2. **Create and edit a note** (FRS 4.1, 4.3) — create a note, then edit its title/content at
     least twice (accumulating retained versions for step 6).
  3. **Tag filtering** (FRS 4.6) — decided during `/spec`: the frontend currently has **no UI**
     to create a tag or attach one to a note (`tagsApi.ts` only exposes `listTags`; neither
     `NoteCreatePage` nor `NoteEditorPage` has a tag-assignment control — confirmed by reading
     both files). This journey seeds a tag and attaches it to the note via Playwright's API
     request context directly against the backend (a standard test-setup pattern), then uses the
     real UI only to verify filtering by that tag on `NotesPage` — the only tag-related UI that
     actually exists. To make the spec's "excludes notes without that tag" scenario meaningful,
     the journey also creates one throwaway, untagged second note via the API purely as a
     fixture, so the filtered view has something real to exclude.
  4. **Search** (FRS 6.1) — search for the note by a distinctive word in its content and confirm
     it appears in results.
  5. **Share** (FRS 7.1, 7.3) — decided during `/spec`, corrected during `/plan`: generate a
     share link through the real UI, then make an unauthenticated HTTP request (not a browser
     page load) to that link's URL and confirm the response contains the note's title/content.
     Corrected during `/plan`: the share link resolves to a backend JSON endpoint (`GET
     /api/share/:token`) — there is no frontend page that renders a shared note (confirmed by
     reading `AppRoutes.tsx`; this is an existing, disclosed gap from AB-1014's scope, not
     something this ticket builds), so "publicly viewable" is verified at the HTTP level.
  6. **Version history restore** (FRS 8.2, 8.4) — decided during `/spec`, corrected during
     `/plan`: open History, restore the version matching the note's state after its first edit
     (selected by that edit's distinctive title text), and confirm the editor's title/content
     update to reflect the restore. Corrected during `/plan`: reading `NoteService.ts` directly
     shows both `createNote` and `updateNote` each snapshot a version (creation snapshots the
     just-created state; every update snapshots the *pre-update* state before applying the new
     one) — so a create followed by two edits retains **three** version rows, not two, and the
     newest of them holds the first edit's content, not the original blank state. Selecting by
     title text rather than "the earlier of two" is correct regardless of the exact count.
- **New `e2e/` directory + root `playwright.config.ts`** (decided during `/spec`): `@playwright/
  test` is already a root devDependency (unused until now) — no new package or dependency.
  `e2e/` is a plain directory, **not** added to `pnpm-workspace.yaml` as a workspace member (no
  `package.json`/`tsconfig.json` of its own needed for a single spec file).
- **Playwright's `webServer` boots both dev servers** (decided during `/spec`): the config
  starts `pnpm dev:backend` and `pnpm dev:frontend` itself before running, with the backend
  pointed at the same real, migrated test PostgreSQL database the existing Vitest+Supertest
  backend tests already use (`.env.test`) — no new infra, no manual server startup, no risk of
  polluting a real dev database.
- **Out of scope**: password reset/OTP (FRS 3.4 — not part of the six named journey steps), CI
  workflow wiring (this ticket is the Playwright suite itself; running it in CI is a separate
  concern not requested), and building the missing tag-creation/assignment UI (flagged as a
  follow-up, not fixed here — see Impact).

## Capabilities

### New Capabilities
- `e2e-user-journey`: the single end-to-end Playwright test covering register → note → tag
  filter → search → share (with public-access verification) → version history restore, per FRS
  3.1, 4.1, 4.3, 4.6, 6.1, 7.1, 7.3, 8.2, 8.4.

### Modified Capabilities
(none — this ticket adds a new test surface over existing, unchanged behavior; no spec-level
requirement in any existing capability changes.)

## Impact

- **New**: `playwright.config.ts` (root) — `webServer` array booting backend+frontend,
  `testDir: "./e2e"`, base URL `http://localhost:5173`; `e2e/journey.spec.ts` — the single test.
- **No new dependency** — `@playwright/test` is already a root devDependency.
- **No backend or frontend application code changes** — this ticket only adds tests that
  exercise already-shipped behavior.
- **No changes to `packages/shared`, `docs/SDS.md`, or any existing OpenSpec capability spec.**
- **Follow-up flagged, not built here**: the frontend has no UI to create a tag or attach one to
  a note (only filtering by existing tags exists). This journey works around it by seeding tag
  data via direct API calls in test setup. A future ticket should add that UI if product wants
  users to actually manage tags from the note editor/creation flow.
