## Context

AB-1010 built the auth pages and left `/notes` as a placeholder (`NotesPlaceholderPage.tsx`) that
shows the logged-in user's email and a logout button, purely to prove `RequireAuth` works. It
explicitly deferred the shared authenticated API client, since none of its pages called a
protected endpoint. This ticket is the first to call `GET /notes` and `GET /tags`, so it must
build that client before the notes list itself can exist.

`main.tsx` already wraps the app in a `QueryClientProvider` (`new QueryClient()`, defaults
untouched) — TanStack Query is wired up but this is the first ticket to issue a real query
through it. `packages/shared` already exports every type this ticket needs
(`NoteSummary`, `NoteListResponse`, `ListNotesQuery`, `TagListItem`, `TagListResponse`,
`AuthTokens`) — no new shared types are required.

## Goals / Non-Goals

**Goals:**
- A shared authenticated `fetch` wrapper with Bearer-token attachment and silent refresh-on-401,
  reusable by every remaining frontend ticket.
- A notes list page at `/notes` with pagination, sorting, and tag filtering per FRS 4.2/4.5/4.6.
- `/notes/:id` and `/notes/new` stub routes as navigation targets for AB-1012.

**Non-Goals:**
- Note create/edit/delete (FRS 4.1, 4.3, 4.4 — AB-1012).
- Search, sharing, version history (AB-1013–1015).
- Handling concurrent multi-tab session refresh, or a "remember me" / persistent-refresh UX
  beyond what AB-1010 already built.

## File Paths

**New:**
- `frontend/src/lib/apiClient.ts` — `ApiError` class (moved here from `authApi.ts`, see Decision
  1), `authenticatedFetch<T>(path, options): Promise<T>`
- `frontend/src/lib/notesApi.ts` — `listNotes(query): Promise<NoteListResponse>`,
  `getNote(id): Promise<NoteSummary>`
- `frontend/src/lib/tagsApi.ts` — `listTags(): Promise<TagListResponse>`
- `frontend/src/pages/NotesPage.tsx` — replaces `NotesPlaceholderPage.tsx` (renamed, not just
  edited — it's no longer a placeholder; see Decision 4)
- `frontend/src/pages/NoteDetailStubPage.tsx` — `/notes/:id`
- `frontend/src/pages/NoteCreateStubPage.tsx` — `/notes/new`

**Modified:**
- `frontend/src/lib/authApi.ts` — re-exports `ApiError` from `apiClient.ts` instead of defining
  it (see Decision 1); no other change
- `frontend/src/AppRoutes.tsx` — swaps `NotesPlaceholderPage` for `NotesPage`, adds `/notes/new`
  and `/notes/:id` routes (both `RequireAuth`-wrapped, `/notes/new` listed first — see Decision 5)
- `frontend/src/main.tsx` — `QueryClient` gets `defaultOptions.queries.retry: 1` (see Decision 3)
- `frontend/src/pages/NotesPlaceholderPage.test.tsx` → renamed `NotesPage.test.tsx`, extended
  with this ticket's new scenarios (existing logout scenarios carry over unchanged, since
  `NotesPage` keeps the same logout button/email display)

**Removed:**
- `frontend/src/pages/NotesPlaceholderPage.tsx` (superseded by `NotesPage.tsx`)

**No backend, no `packages/shared`, no `docs/SDS.md` changes.**

## Decisions

### Decision 1: `ApiError` moves to `apiClient.ts`, re-exported from `authApi.ts`
`notesApi.ts` and `tagsApi.ts` need the same `ApiError` shape `authApi.ts` already defines.
Moving it to the new `apiClient.ts` (the lower-level networking module) and having `authApi.ts`
do `export { ApiError } from "./apiClient"` keeps a single definition without touching the five
already-merged AB-1010 test files that import `ApiError` via `authApi` (`import * as authApi
from "@/lib/authApi"; ... authApi.ApiError`).
**Alternative considered**: duplicate a second `ApiError` class in `apiClient.ts` — rejected,
two classes for the same shape would break `instanceof` checks across modules.

### Decision 2: `authApi.ts`'s internals are not refactored to use `apiClient`
`authApi.ts`'s five functions stay exactly as AB-1010 wrote them (`postJson` with manual
`Authorization` header on `logout` only). Only `ApiError`'s definition moves.
**Alternative considered**: route `logout` through `authenticatedFetch` for consistency —
rejected as unnecessary churn on tested, merged code; logout is a terminal action with no need
for silent refresh (if the access token is already expired at logout time, the logout call
simply 401s and the client-side session clear happens regardless, per AB-1010's existing
`onSettled` behavior).

### Decision 3: Silent refresh uses a shared in-flight promise (mutex), not one refresh per request
This page fires `GET /notes` and `GET /tags` concurrently on load. If the access token happens to
be expired at that moment, both requests 401 at roughly the same time. Refresh tokens are
rotated on use and reuse is treated as a compromise signal (SDS Section 4) — two independent,
concurrent calls to `POST /auth/refresh` with the same stored refresh token would have the
second one fail, and per SDS's reuse-detection rule could revoke *all* of the user's refresh
tokens, force-logging them out on what should have been a transparent refresh. `apiClient.ts`
holds a module-level `let inFlightRefresh: Promise<AuthTokens> | null`; the first 401 starts the
refresh and stores the promise, every other concurrent 401 awaits that same promise instead of
starting its own, and the slot is cleared in a `finally`. This is an implementation detail, not a
new observable scenario — it doesn't change any single-request behavior the spec describes, it
just makes the "silent refresh" requirement actually hold under concurrent requests.
**Alternative considered**: let each request refresh independently — rejected per the compromise
risk above, confirmed against SDS Section 4's refresh-rotation rule.
Also setting the app's `QueryClient` `defaultOptions.queries.retry` from the untouched default
(3) down to `1`: with the default, a genuine session-expiry failure (refresh itself failed) would
cause TanStack Query to silently retry the already-failed query up to 3 more times before
surfacing an error, adding a several-second delay before `RequireAuth`'s redirect (triggered by
`authStore.logout()`, see Decision 4) is even visible. `retry: 1` still tolerates one transient
network blip without adding a long delay to the actual logout path.

### Decision 4: Refresh failure clears the session; navigation to `/login` happens via the
already-mounted `RequireAuth` guard, not an explicit `navigate()` call inside `apiClient.ts`
`apiClient.ts` is a plain module with no access to the router. On unrecoverable refresh failure
it calls `useAuthStore.getState().logout()` (clears `localStorage` and the Zustand `session`
state) and throws. `RequireAuth` already does `useAuthStore((s) => s.session)` — a reactive
Zustand selector — so the moment `session` becomes `null`, every mounted `RequireAuth`-wrapped
page (including `/notes`, `/notes/:id`, `/notes/new`) re-renders to `<Navigate to="/login"
replace />` automatically. This reuses AB-1010's existing reactive-store pattern instead of
inventing a second navigation mechanism.
**Alternative considered**: `window.location.href = "/login"` from `apiClient.ts` — rejected, a
full page reload is a worse UX than the SPA redirect `RequireAuth` already provides for free, and
would blow away the React Query cache unnecessarily.

### Decision 5: `NotesPlaceholderPage.tsx` is renamed to `NotesPage.tsx`, not edited in place
The file is no longer a placeholder once it renders the real list, so keeping the name would be
misleading. Its existing logout button and "Logged in as {email}" line move into the top of the
new page unchanged (same markup, same test assertions) — this ticket is additive to that
behavior, not a rewrite of it. `/notes/new` is declared before `/notes/:id` in `AppRoutes.tsx`
for human readability, though react-router's ranking would resolve them correctly regardless of
declaration order.
**Alternative considered**: keep the `NotesPlaceholderPage` filename and just change its
contents (this is literally what AB-1010's proposal said would happen) — rejected on reflection
since "placeholder" would no longer describe the file, and renaming costs nothing beyond
updating one import in `AppRoutes.tsx` and the test file name.

### Decision 6: Query params (page, sort, tag filter) live in local component state, not Zustand
`frontend/CLAUDE.md` reserves Zustand for local/UI state with no server representation. The
current page number, sort choice, and active tag filter are exactly that (no server endpoint
represents "what page am I on"), but they're only ever read by `NotesPage` itself — a plain
`useState` in the component is simpler than a store nobody else needs to read, and avoids
premature global state. TanStack Query owns the actual fetched data (`["notes", filters]` and
`["tags"]` query keys); the `useState` values are just the inputs to that query key.
**Alternative considered**: a Zustand store for list filters — rejected, no other component
needs this state, and `frontend/CLAUDE.md`'s Zustand carve-out is for state truly shared or
UI-only, not single-component form state.

### Decision 7: No new shadcn/ui primitive for tag chips or the sort control
The sort control is a native `<select>` (no shadcn `Select` component exists in this project's
hand-written set — see AB-1010's design.md on the registry outage). Tag chips are `<button>`
elements styled with the existing `buttonVariants` (`variant="secondary"` when active,
`variant="outline"` when inactive) rather than a new `Badge`/`Toggle` component, keeping this
ticket from having to hand-write another primitive for a single use site.
**Alternative considered**: a dedicated `TagChip` component — rejected as premature abstraction
for a component used in exactly one place.

## Risks / Trade-offs

- **[Risk]** The refresh mutex (Decision 3) is the trickiest piece of new logic in this ticket
  and has no direct spec scenario covering concurrent requests (the spec's "attempted at most
  once per request" scenario is per-request, not cross-request). → **Mitigation**: covered by a
  dedicated unit test on `apiClient.ts` driving two concurrent `authenticatedFetch` calls through
  a mocked 401-then-success sequence and asserting `fetch` for `/auth/refresh` is called exactly
  once; called out explicitly in `tasks.md` as behavior beyond the spec's literal text.
- **[Risk]** Lowering global `retry` to `1` affects every future query, not just this ticket's.
  → **Mitigation**: this is the correct default for the whole app (fail fast enough that
  `RequireAuth`'s redirect isn't delayed), and no ticket so far has depended on TanStack Query's
  default retry-3 behavior; flagged here in case a future ticket has a reason to want more.
- **[Risk]** The `/notes/:id` and `/notes/new` stub pages are throwaway (AB-1012 replaces both).
  → **Mitigation**: kept intentionally minimal (a fetch + read-only render, a static message) so
  there's little to discard; explicitly disclosed as stubs in the proposal, not silently
  under-built.

## Checkpoint Plan

- After foundation (apiClient + notesApi/tagsApi + retry config): `pnpm build` → 0 errors,
  `pnpm lint --max-warnings 0`, `pnpm test` → all still green (no new tests yet at this point
  beyond the apiClient unit tests, which should already be passing).
- After core implementation (NotesPage, stub pages, routes): `pnpm build`, `pnpm lint`, `pnpm
  test`, plus a manual browser smoke test against the live backend (paginate, sort, filter by
  tag, click a note, click "New note", let an access token expire and confirm silent refresh —
  achievable by temporarily shortening the JWT expiry env var for the test run — then confirm a
  revoked/invalid refresh token correctly logs the user out).
- After tests (one per spec scenario, `frontend-api-client` + `frontend-notes`): `pnpm build`,
  `pnpm lint --max-warnings 0`, `pnpm test --coverage` → all green, ≥80% coverage on new files.
