## 1. Foundation

No `[PARALLEL]` tasks — this ticket adds no backend/frontend application code, only a test
harness; there's nothing to split across worktrees.

- [x] 1.1 Create `playwright.config.ts` at the repo root (design.md Decisions 1–3, 9):
      `testDir: "./e2e"`, `use: { baseURL: "http://localhost:5273" }`, `webServer` array with two
      entries — backend (`command: "pnpm --filter @note-taking-app/backend dev"`, `url:
      "http://localhost:3200/api/tags"`, `reuseExistingServer: false`, `env: { PORT: "3200",
      APP_BASE_URL: "http://localhost:3200", DOTENV_CONFIG_PATH: ".env.test" }`, `timeout:
      30_000`) and frontend (`command: "pnpm --filter @note-taking-app/frontend dev --port
      5273"`, `url: "http://localhost:5273"`, `reuseExistingServer: false`, `env: {
      VITE_API_BASE_URL: "http://localhost:3200/api" }`, `timeout: 30_000`). **Found and fixed
      during implementation**: an extra `--` before `--port 5273` in the frontend command made
      Vite silently ignore the port override and fall back to its default (which was already
      occupied, causing a confusing failure) — removed the stray `--`. **Found and fixed during
      implementation**: `.env.test`'s `APP_BASE_URL=http://localhost:3000` is used to build share
      links server-side (`buildShareUrl`), so without an `APP_BASE_URL` override the generated
      share URL pointed at the wrong port — added the override alongside `PORT`
- [x] 1.2 Create `e2e/helpers.ts` (design.md Decision 5): `uniqueEmail(): string` (timestamp +
      random suffix); `getAccessToken(page: Page): Promise<string>` (reads and JSON-parses
      `localStorage.getItem("note-app-session")`, returns `.accessToken`); `seedTagOnNote(request:
      APIRequestContext, accessToken: string, noteId: string, tagName: string): Promise<void>`
      (`POST /tags` then `PATCH /notes/:id` with the returned tag's id in `tagIds`, both with an
      `Authorization: Bearer` header); `seedUntaggedNote(request: APIRequestContext, accessToken:
      string): Promise<{ id: string }>` (`POST /notes`, throwaway fixture note per design.md
      Decision 5)
- [x] 1.3 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` (`e2e/` and
      `playwright.config.ts` lint cleanly under the existing flat ESLint config, which already
      anticipated Playwright output dirs in its ignores from Phase 0 scaffolding), `pnpm test` →
      all still green (no Vitest changes). Installed the Playwright chromium browser
      (`npx playwright install chromium --with-deps`) — not yet present in this environment.

## 2. Core Implementation

One sequential `test()` in `e2e/journey.spec.ts` (design.md Decision 8) — each sub-task below
implements one journey step within that same, growing test function, in order:

- [x] 2.1 **Register** (spec: "Registering a new account signs the user in"): generate a unique
      email via `uniqueEmail()`, navigate to `/register`, fill Email/Password, submit "Create
      account", assert the notes list page is shown (`Logged in as <email>` visible). **Found
      during implementation**: the shared `passwordSchema` requires a letter AND a number — the
      initial test password had neither digit, adjusted to satisfy it
- [x] 2.2 **Create and edit a note** (spec: "Creating and editing a note accumulates versions"):
      click "New note", wait for the editor to load, type a distinctive first-edit title/body via
      `locator.click()` + `page.keyboard.type(...)` (TipTap's contenteditable doesn't support
      `fill()`, per design.md Risks), then a distinctive second-edit title/body. **Found and fixed
      during implementation**: waiting on the transient "Saving..." status text was flaky (the
      local save often completes faster than the assertion's poll interval can observe the
      in-between state) — replaced with `page.waitForResponse(...)` matching the actual `PATCH
      /notes/:id` network call, which is deterministic and immune to UI-timing races
- [x] 2.3 **Tag filtering** (spec: "Filtering by a tag shows only the tagged note"): extract the
      access token via `getAccessToken(page)`, read the current note's id from the URL, call
      `seedTagOnNote(...)` to create+attach a tag, call `seedUntaggedNote(...)` for the exclusion
      fixture, navigate to `/notes`, click the seeded tag's filter button, assert the tagged
      note's title is visible and the untagged fixture note's title is not
- [x] 2.4 **Search** (spec: "Searching for note content returns the note"): navigate to
      `/search`, type a distinctive word (the run token) from the note's current (second-edit)
      body into the search input, assert the note's title appears in results
- [x] 2.5 **Share** (spec: "An unauthenticated request to a share link returns the note's
      content"): navigate back to the note, click "Share", click "Generate", read the displayed
      share URL text, use the `request` fixture with no `Authorization` header to `GET` that URL,
      assert a `200` response whose JSON body's `title`/`content` match the note's current state
- [x] 2.6 **Version history restore** (spec: "Restoring an earlier version updates the editor in
      place"): click "History", select the list entry whose title matches the first edit's
      distinctive title (design.md Decision 6 — not by position/count), click "Restore", confirm,
      assert the editor's title input and body now show the first edit's title/content
- [x] 2.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      still green (87 frontend + 101 backend), then ran `npx playwright test` locally three times
      in a row — twice clean (confirming no leftover state from run 1 breaks run 2, per design.md's
      isolation claim), plus a deliberate failure-path sanity check (temporarily replaced the
      final restore assertion's expected value, confirmed the suite genuinely failed with a clear
      diff, then restored the correct assertion and confirmed green again) — per design.md's
      checkpoint plan

## 3. Verification (one check per spec scenario)

This ticket's single `e2e/journey.spec.ts` test *is* the verification for all six spec
scenarios (design.md Decision 8 — one continuous journey, not six separate tests). This phase
confirms each scenario's assertion genuinely exists and would fail if its behavior broke,
rather than adding new test files:

- [x] 3.1 Confirmed scenario "Registering a new account signs the user in" is covered by task
      2.1's `Logged in as <email>` assertion — the failure-path sanity check (task 2.7) already
      demonstrated the suite fails loudly and specifically when an assertion is wrong, giving
      confidence this one is load-bearing too
- [x] 3.2 Confirmed scenario "Creating and editing a note accumulates versions" is covered by
      task 2.2 and validated end-to-end by task 2.6 successfully finding and restoring the exact
      version created by the first edit — this is a stronger check than asserting a raw version
      count, since it proves the retained version's *content* is correct, not just that some
      version row exists
- [x] 3.3 Confirmed scenario "Filtering by a tag shows only the tagged note" is covered by task
      2.3's positive ("tagged note visible") + negative ("untagged fixture note not visible")
      assertion pair — the negative half only became meaningful once `seedUntaggedNote` was added
      to give the filter something real to exclude
- [x] 3.4 Confirmed scenario "Searching for note content returns the note" is covered by task
      2.4's assertion
- [x] 3.5 Confirmed scenario "An unauthenticated request to a share link returns the note's
      content" is covered by task 2.5's assertion — the response is fetched with no
      `Authorization` header at all via the `request` fixture, genuinely unauthenticated
- [x] 3.6 Confirmed scenario "Restoring an earlier version updates the editor in place" is
      covered by task 2.6's assertion, and confirmed genuinely load-bearing by the task 2.7
      failure-path check (which deliberately broke this exact assertion)
- [x] 3.7 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0`, `pnpm test` → all
      green (87 frontend + 101 backend), `npx playwright test` → green

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1016-e2e-playwright`
- [x] 4.2 Update `docs/TICKETS.md` AB-1016 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
