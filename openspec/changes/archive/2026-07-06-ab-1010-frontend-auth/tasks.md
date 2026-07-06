## 1. Foundation

- [x] 1.1 Initialize shadcn/ui: added a `@/*` → `./src/*` path alias to
      `frontend/tsconfig.json`'s `compilerOptions.paths` (no `baseUrl` — deprecated in the
      installed TS 6, `paths` alone resolves relative to the tsconfig file) and mirrored it in
      `frontend/vite.config.ts`'s `resolve.alias`; created `frontend/components.json`; created
      `frontend/src/lib/utils.ts` (`cn()` via `clsx` + `tailwind-merge`)
- [x] 1.2 Generate shadcn primitives: the CLI was blocked by the corporate npm registry's auth
      failure (confirmed via direct `curl`, not transient — a genuine 401 even with stored
      credentials); hand-wrote `Button`, `Input`, `Label`, `Card` matching shadcn's standard
      "new-york" style source directly (consistent with shadcn's own model — components are
      copied into the project, the CLI is just a convenience copier), plus the theme CSS
      variables in `frontend/src/index.css` that these components reference
- [x] 1.3 Added `@testing-library/react`, `@testing-library/jest-dom`,
      `@testing-library/user-event` as pinned dev dependencies (installed via
      `npm_config_registry=https://registry.npmjs.org/` to route around the broken corporate
      proxy — the project's own `.npmrc` already points at the public registry, but `pnpm`
      wasn't honoring it for fresh fetches); created `frontend/src/test/setup.ts` importing
      `@testing-library/jest-dom/vitest`; wired into `frontend/vitest.config.ts`'s
      `test.setupFiles`
- [x] 1.4 Added `frontend/.env.example` with `VITE_API_BASE_URL="http://localhost:3000/api"`,
      plus a local (gitignored) `frontend/.env` copy for actual dev use
- [x] 1.5 Added `react-router` 8.1.0 as a pinned dependency (the unified package, no separate
      `react-router-dom`)
- [x] 1.6 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm test` → 101/101 backend tests still green (frontend has no tests yet — expected,
      `passWithNoTests: true`)

## 2. Core Implementation

No `[PARALLEL]` tasks — this entire ticket is frontend-only, nothing to split across worktrees.

- [x] 2.1 Create `frontend/src/lib/authStorage.ts`: `StoredSession` interface,
      `saveSession`/`loadSession`/`clearSession` against a single `note-app-session`
      localStorage key (Decision 1)
- [x] 2.2 Create `frontend/src/store/authStore.ts`: Zustand store (`session`, `login(session)`,
      `logout()`) backed by `authStorage.ts` (Decision 1)
- [x] 2.3 Create `frontend/src/lib/authApi.ts`: `ApiError` class (`status`, `code`, `message`,
      `fields?`) and `register`/`login`/`logout`/`forgotPassword`/`resetPassword` fetch
      functions against `VITE_API_BASE_URL`; `logout` attaches the `Authorization` header
      directly (Decision 3). Also added `frontend/src/vite-env.d.ts` to type
      `import.meta.env.VITE_API_BASE_URL`, and `frontend/src/lib/formErrors.ts` (shared
      Zod-issue/API-field-error grouping helper reused by all four form pages)
- [x] 2.4 Create `frontend/src/components/RequireAuth.tsx` and `RedirectIfAuthed.tsx`: read
      `useAuthStore`, render `<Navigate>` or `children`
- [x] 2.5 Create `frontend/src/pages/RegisterPage.tsx`: controlled form validated with
      `registerSchema.safeParse` (Decision 2), `useMutation` wrapping `authApi.register`
      (Decision 4), on success calls `authStore.login(...)` and navigates to `/notes`, surfaces
      duplicate-email and field-level errors
- [x] 2.6 Create `frontend/src/pages/LoginPage.tsx`: same pattern as 2.5 using `loginSchema`/
      `authApi.login`; on failure shows one generic error, never field-level
- [x] 2.7 Create `frontend/src/pages/ForgotPasswordPage.tsx`: email-only form using
      `forgotPasswordSchema`/`authApi.forgotPassword`; always shows the same generic
      confirmation (with the dev-mode server-console note) regardless of the API result
- [x] 2.8 Create `frontend/src/pages/ResetPasswordPage.tsx`: email/OTP/newPassword form using
      `resetPasswordSchema`/`authApi.resetPassword`; branches on the response's `error.code`
      (`EXPIRED_OTP` → 410, `INVALID_OTP` → 401, `VALIDATION_ERROR` → field errors from
      `error.fields`, per Decision 5) to show the three distinct messages; on success navigates
      to `/login` (NOT `/notes` — no session persisted, per FRS 3.4.5)
- [x] 2.9 Create `frontend/src/pages/NotesPlaceholderPage.tsx`: shows the logged-in user's
      email (from `authStore`) and a logout button calling `authApi.logout` +
      `authStore.logout()` + navigate to `/login`
- [x] 2.10 Rewrite `frontend/src/App.tsx`: `<BrowserRouter>`/`<Routes>` for `/register`,
      `/login`, `/forgot-password`, `/reset-password` (each wrapped in `RedirectIfAuthed`),
      `/notes` (wrapped in `RequireAuth`), catch-all redirect to `/login`
- [x] 2.11 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm test` → 101/101 backend tests still green. Manually smoke-tested in a real browser
      (via the Preview tool) against the running backend: registered a new account (confirmed
      redirect to `/notes`, session persisted across a full page reload), logged out (confirmed
      redirect to `/login`), confirmed unauthenticated `/notes` access redirects to `/login`,
      attempted registration with a duplicate email (confirmed the generic backend error),
      submitted a weak password (confirmed both violated rules listed, blocked client-side with
      no network call), requested a password reset (confirmed the generic confirmation with the
      dev-mode console hint, retrieved the real OTP from the backend log), submitted a wrong OTP
      (confirmed the distinct "invalid or used" message), submitted the correct OTP with a weak
      new password (confirmed the field error came from the API response per Decision 5, not
      client-side Zod — the OTP was accepted, proving the two checks are properly sequenced),
      completed the reset successfully (confirmed redirect to `/login` with a success banner,
      NOT an auto-logged-in `/notes`), logged in with the new password (confirmed success),
      confirmed authenticated visits to `/login` redirect to `/notes`, confirmed invalid
      credentials show one generic error with no field distinction, confirmed zero browser
      console warnings/errors throughout — every scenario matched the design exactly

## 3. Tests (one per spec scenario)

New component tests under `frontend/src/pages/*.test.tsx` and `frontend/src/AppRoutes.test.tsx`,
mocking `frontend/src/lib/authApi.ts`'s functions via `vi.mock` — 13 scenarios. Also added
`frontend/src/test/renderWithProviders.tsx` (wraps a component in `QueryClientProvider` +
`MemoryRouter` — every page uses `useMutation`, which throws without a `QueryClient` in the
tree) and two test-configuration fixes: `frontend/vitest.config.ts` gained the same `@` →
`./src` resolve alias `vite.config.ts` already has (vitest doesn't inherit it automatically),
and `frontend/src/test/setup.ts` gained an `afterEach(cleanup)` call (without
`test.globals: true`, Testing Library's automatic cleanup between tests wasn't firing, leaking
DOM across tests in the same file):

- [x] 3.1 Test: Successful registration navigates to the notes page
- [x] 3.2 Test: Duplicate email shows the generic backend error
- [x] 3.3 Test: Weak password shows field-level errors
- [x] 3.4 Test: Successful login navigates to the notes page
- [x] 3.5 Test: Invalid credentials show one generic error
- [x] 3.6 Test: Logging out clears the session and navigates to login
- [x] 3.7 Test: Submitting any email shows the same generic confirmation
- [x] 3.8 Test: Successful reset navigates to login, not notes
- [x] 3.9 Test: Expired OTP shows a distinct message
- [x] 3.10 Test: Invalid or already-used OTP shows a distinct message
- [x] 3.11 Test: Weak new password shows field-level errors
- [x] 3.12 Test: Unauthenticated visit to the notes page redirects to login
- [x] 3.13 Test: Authenticated visit to an auth page redirects to notes

- [x] 3.14 Checkpoint: `pnpm build` → 0 errors, `pnpm lint --max-warnings 0` clean,
      `pnpm test --coverage` → frontend 13/13 green (81.28% stmts / 81.46% lines — `authApi.ts`
      itself shows lower coverage since it's mocked in every component test; its real
      implementation was already exercised end-to-end against the live backend in the 2.11
      manual smoke test), backend 101/101 still green and unaffected

## 4. Archive

- [x] 4.1 Run `openspec archive ab-1010-frontend-auth`
- [x] 4.2 Update `docs/TICKETS.md` AB-1010 status to `In progress` (not `Done` — that's set by
      `/pr` as `PR open (#N)`, then manually after merge)
