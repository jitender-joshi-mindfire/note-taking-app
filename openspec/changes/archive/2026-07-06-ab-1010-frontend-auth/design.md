## Context

This is the first ticket to render actual UI. Inspecting the current `frontend/` scaffold
(from Phase 0) surfaced three gaps beyond what the proposal anticipated, none previously
flagged anywhere in `docs/FRS.md`, `docs/SDS.md`, or `AGENTS.md`:

1. **shadcn/ui was never initialized** — `class-variance-authority`, `clsx`, `tailwind-merge`,
   `@radix-ui/react-slot`, and the `shadcn` CLI package are all installed, but there's no
   `components.json`, no `@/*` path alias, no `lib/utils.ts` `cn()` helper, and no generated
   primitives (Button, Input, etc.). `frontend/CLAUDE.md`'s "add new components via the shadcn
   CLI" instruction has nothing to build on yet.
2. **No component-testing library is installed** — `frontend/vitest.config.ts` already sets
   `environment: "jsdom"`, but `@testing-library/react`, `@testing-library/jest-dom`, and
   `@testing-library/user-event` are absent from `package.json`. `AGENTS.md`'s "Vitest + Testing
   Library" testing approach has no library to actually use yet.
3. **No frontend env-var convention exists** — the backend has `.env`/`.env.example`, but
   `frontend/` has neither, and the frontend needs to know the backend's base URL (`5173` dev
   server talking to `3000` API).

All three are addressed in this ticket's Foundation phase, since nothing UI-related can be
built without them and no later ticket would naturally revisit "did shadcn ever get initialized."

**Context7 note**: unavailable this session (consistent with every prior ticket). The exact
React Router v7 API surface (this design uses the classic `<BrowserRouter>`/`<Routes>`/`<Route>`
component API, not the newer data-router `createBrowserRouter`) is verified by TypeScript's own
type definitions at implementation time rather than live docs — a reasonable substitute here
since a JSX/props API mismatch fails to compile immediately, unlike a runtime-only Prisma/SQL
risk from prior tickets.

## Goals / Non-Goals

**Goals:**
- Registration, login, logout, forgot-password, reset-password pages (FRS 3.1–3.4).
- Route protection (`RequireAuth`/`RedirectIfAuthed`) and a placeholder `/notes` page.
- Initialize shadcn/ui and Testing Library as reusable foundations for every later frontend
  ticket, not just this one.

**Non-Goals:**
- No authenticated API client with token-attach/refresh-on-401 (deferred to AB-1011, per
  `/spec`).
- No react-hook-form — see Decision 2.
- No password-strength meter or other UX polish beyond what FRS requires.

## Decisions

### Decision 1: Session stored in a single Zustand store backed by one localStorage key

`RequireAuth`/`RedirectIfAuthed` need synchronous, reactive access to "is there a session" from
anywhere in the component tree — exactly Zustand's use case per `frontend/CLAUDE.md` ("local/UI
state... that has no server representation"; the *client-side presence* of a session is a local
routing concern, distinct from the server-side user data TanStack Query would own). One
`localStorage` key (`note-app-session`) holds the whole `{ user, accessToken, refreshToken }`
blob as JSON, read once at store initialization; all writes go through the store's `login`/
`logout` actions, which keep `localStorage` and the in-memory store in sync together — never
written to independently.

**Alternative considered**: read `localStorage` directly in each component with no store —
rejected because `localStorage` changes don't trigger React re-renders on their own, so a guard
component wouldn't reactively update after a same-tab logout without a full page reload.

### Decision 2: Manual controlled-input forms + Zod `safeParse`, not react-hook-form

`react-hook-form` (shadcn's usual `Form` component pairing) isn't installed, and none of this
project's tickets have needed it yet. Adding it now, for four fairly simple forms, is a bigger
dependency-footprint decision than this ticket's scope warrants. Each page uses plain
`useState` for field values, validates with the relevant schema's `.safeParse()` on submit
(reusing the exact same `packages/shared` schemas the backend validates with — satisfying
`frontend/CLAUDE.md`'s "never hand-write a parallel validation rule" without needing
react-hook-form to do it), and renders shadcn's `Button`/`Input`/`Label` primitives directly.

**Alternative considered**: add `react-hook-form` + `@hookform/resolvers` now and use shadcn's
full `Form` component — rejected as unnecessary weight for four simple forms; revisit if a
later ticket (e.g. AB-1012's editor) needs more sophisticated form state.

### Decision 3: A thin, auth-only `fetch` wrapper — not the deferred general API client

Per `/spec`, the general authenticated API client (token-attach, refresh-on-401) is out of
scope. But the five `/api/auth/*` calls this ticket makes still need a typed error shape to
branch on (expired vs. invalid OTP, weak-password field errors, generic invalid-credentials).
`frontend/src/lib/authApi.ts` exports one `ApiError` class (`status`, `code`, `message`,
`fields?`) and five plain `fetch`-based functions (`register`, `login`, `logout`,
`forgotPassword`, `resetPassword`). `logout` is the only one needing an `Authorization` header
(per SDS Section 5's `POST /auth/logout` contract) — attached directly in that one function,
not via a generalized interceptor, since there's exactly one call site.

**Alternative considered**: build the full authenticated client now and just not use its
refresh logic yet — rejected; `/spec` explicitly scoped this out, and a same-shape `ApiError`
is enough for this ticket's actual needs.

### Decision 4: `useMutation` per auth action, not raw async handlers

Each page's submit handler calls a `useMutation` wrapping the corresponding `authApi.ts`
function — TanStack Query is already wired in `main.tsx`'s `QueryClientProvider`, and
`useMutation` is its standard primitive for a one-shot server write with built-in
loading/error/success state, avoiding hand-rolled `useState`-based loading flags.

### Decision 5: Reset-password's field-level errors come from the API response, not client Zod

`resetPasswordSchema.newPassword` is deliberately `z.string().min(1)` (shape-only) — the backend
checks complexity *after* OTP validation (AB-1003 Decision 3), so a bad OTP can't be masked by a
client-side password-strength rejection. The reset page's client-side `safeParse` therefore
cannot catch a weak password before submission; the "Weak new password shows field-level
errors" scenario is satisfied by rendering the `fields` array from a `400 VALIDATION_ERROR`
response, exactly mirroring how the backend already separates these two concerns.

## Foundation Work (new, not in the original proposal)

- **shadcn/ui init**: add a `@/*` → `./src/*` path alias (`frontend/tsconfig.json`'s
  `compilerOptions.paths`, mirrored in `frontend/vite.config.ts`'s `resolve.alias` — Vite
  doesn't read `tsconfig.json` paths on its own without a plugin, and adding one is more
  machinery than a two-line manual alias); `frontend/components.json`; `frontend/src/lib/
  utils.ts` (`cn()` via `clsx` + `tailwind-merge`, both already installed); generate `Button`,
  `Input`, `Label`, `Card` via the shadcn CLI (`pnpm dlx shadcn@latest add button input label
  card` — pinned to whatever version actually installs, per the no-`@latest`-in-package.json
  rule; the CLI invocation itself isn't a dependency pin the way a `package.json` entry is).
- **Testing Library**: add `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event` as pinned dev dependencies; a `frontend/src/test/setup.ts`
  importing `@testing-library/jest-dom` matchers, wired into `vitest.config.ts`'s
  `test.setupFiles`.
- **Frontend env convention**: `frontend/.env.example` with
  `VITE_API_BASE_URL="http://localhost:3000/api"`; `authApi.ts` reads
  `import.meta.env.VITE_API_BASE_URL`.

## Shared Code Reuse (`packages/shared`, no changes needed)

`registerSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `AuthUser`,
`AuthTokens` — all already exist from AB-1002/AB-1003 and are imported as-is.

## Frontend Changes

**New `frontend/src/lib/authStorage.ts`**: `StoredSession` interface (`{ user: AuthUser;
accessToken: string; refreshToken: string }`), `saveSession`/`loadSession`/`clearSession`
against the single `note-app-session` localStorage key.

**New `frontend/src/store/authStore.ts`**: Zustand store, `{ session: StoredSession | null,
login(session), logout() }`, per Decision 1.

**New `frontend/src/lib/authApi.ts`**: `ApiError` class + five fetch functions, per Decision 3.

**New `frontend/src/components/RequireAuth.tsx`** and **`RedirectIfAuthed.tsx`**: read
`useAuthStore`, render `<Navigate>` or `children`.

**New pages** (`frontend/src/pages/`): `RegisterPage.tsx`, `LoginPage.tsx`,
`ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `NotesPlaceholderPage.tsx` — each a
controlled form (Decision 2) wired to its `useMutation` (Decision 4), rendering shadcn
primitives.

**Rewritten `frontend/src/App.tsx`**: `<BrowserRouter>` wrapping `<Routes>` for `/register`,
`/login`, `/forgot-password`, `/reset-password` (each wrapped in `RedirectIfAuthed`), `/notes`
(wrapped in `RequireAuth`), and a catch-all redirect to `/login`.

**New dependency**: `react-router` (pinned to whatever version `pnpm add react-router` resolves
at implementation time — the v7+ unified package includes DOM bindings, no separate
`react-router-dom` needed).

## Database Migration

None — frontend-only ticket.

## Risks / Trade-offs

- **[Risk]** React Router's exact v7 component API (unverified via Context7) → **Mitigation**:
  TypeScript's own type-checking at build time substitutes for live-docs verification here,
  since a JSX/props mismatch is a compile error, not a runtime surprise (unlike prior tickets'
  Prisma/SQL risks, which needed empirical smoke tests instead).
- **[Trade-off]** Manual controlled forms (Decision 2) mean four pages each hand-roll their own
  `useState`/`onChange`/error-mapping boilerplate → accepted for now given the low form count
  and complexity; revisit react-hook-form if a later ticket's forms get significantly more
  complex.
- **[Trade-off]** `localStorage` for tokens (already decided at `/spec`) is more XSS-exposed
  than an httpOnly cookie → accepted, matches the backend's actual response shape (tokens in
  JSON body) without an out-of-scope backend architecture change.
- **[Risk]** Testing Library version compatibility with React 19 → **Mitigation**: `pnpm add`
  resolves and pins whatever version actually supports the installed React version; verified by
  running the test suite at the Foundation checkpoint before writing any component tests.
