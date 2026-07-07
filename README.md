# Note Taking App

A full-stack note-taking application where authenticated users create, organize, search, and
share notes. Every note supports tagging, full-text search, shareable public read-only links,
and per-note version history with restore.

## Features

- **Auth** — register, login, logout, forgot/reset password via a one-time code (logged to the
  console — no real email sending)
- **Notes** — create, edit, soft-delete, pagination, sorting
- **Tags** — user-scoped tags with per-tag note counts; filter the notes list by tag
- **Search** — PostgreSQL full-text search with keyword highlighting
- **Sharing** — generate/revoke a public, read-only link with an expiry and a view count
- **Version History** — every save snapshots a version; view or restore any past version

Out of scope, by design: real-time collaborative editing, file/image attachments, a mobile app,
OAuth/social login, note folders, and real email delivery.

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite, TanStack Query, Zustand, TipTap, shadcn/ui |
| Backend | Node.js 22, Express 5, TypeScript (ESM) |
| Database | PostgreSQL 16 + Prisma ORM |
| Auth | JWT access token (15 min) + rotating refresh token (7 days, DB-persisted) |
| Search | PostgreSQL full-text search (`tsvector` + GIN index) — no external search service |
| Testing | Vitest + Supertest (backend), Vitest + Testing Library (frontend), Playwright (E2E) |
| Monorepo | pnpm workspaces |

## Project Structure

```
backend/          Express REST API — routes, services, middleware, Prisma schema/migrations
frontend/         React SPA (Vite) — pages, components, API clients
packages/shared/  TypeScript types and Zod schemas shared by backend and frontend
e2e/              Playwright end-to-end test (register → note → tag → search → share → history)
docs/             FRS.md (business requirements), SDS.md (technical design), TICKETS.md (build log)
openspec/         Per-ticket spec artifacts (proposal → design → tasks → archive)
```

## Prerequisites

- Node.js 22.x
- pnpm 11.x
- PostgreSQL 16 running locally (or reachable via `DATABASE_URL`)

## Setup

1. **Install dependencies** (also generates the Prisma client via a `postinstall` hook):

   ```
   pnpm install
   ```

2. **Configure environment variables:**

   ```
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

   Backend `.env` — adjust `DATABASE_URL` if your Postgres isn't on `localhost:5432` with the
   default `postgres`/`postgres` credentials, and set real secrets for `JWT_ACCESS_SECRET` /
   `JWT_REFRESH_SECRET` outside of local dev:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/note_taking_app?schema=public"
   JWT_ACCESS_SECRET="change-me"
   JWT_REFRESH_SECRET="change-me"
   PORT=3000
   APP_BASE_URL="http://localhost:3000"
   ```

   Frontend `.env` — points the SPA at the backend:

   ```
   VITE_API_BASE_URL="http://localhost:3000/api"
   ```

3. **Create the databases and run migrations.** Prisma commands must be run from inside
   `backend/` (its `prisma.config.ts` loads `backend/.env` via `dotenv/config`, which only looks
   in the current working directory):

   ```
   createdb note_taking_app
   createdb note_taking_app_test   # used by backend tests and the Playwright E2E suite

   cd backend
   npx prisma migrate deploy
   ```

   A `backend/.env.test` (already checked in, pointed at `note_taking_app_test`) is used
   automatically by `pnpm --filter backend test` and by the Playwright suite — apply migrations
   to that database too, still from inside `backend/`:

   ```
   DOTENV_CONFIG_PATH=.env.test npx prisma migrate deploy
   ```

## Running the app

```
pnpm dev:backend    # http://localhost:3000
pnpm dev:frontend   # http://localhost:5173
```

Open `http://localhost:5173` and register a new account.

## Testing

**Unit / integration (Vitest, all workspaces):**

```
pnpm build            # 0 errors, 0 warnings
pnpm lint             # --max-warnings 0
pnpm test             # backend (Supertest against a real test DB) + frontend (Testing Library)
pnpm test --coverage  # with coverage report
```

**End-to-end (Playwright):**

```
npx playwright install chromium   # first time only
npx playwright test
```

The E2E suite boots its own isolated backend (port 3200, against the `note_taking_app_test`
database) and frontend (port 5273) via `playwright.config.ts` — it never touches your normal
dev servers, dev ports, or the `note_taking_app` database, so it's safe to run alongside `pnpm
dev:backend`/`pnpm dev:frontend`.

## Building for production

```
pnpm build
```

Builds `packages/shared`, `backend` (to `backend/dist`), and `frontend` (to `frontend/dist`).

## Further documentation

- [`docs/FRS.md`](docs/FRS.md) — functional requirements (business rules, acceptance criteria)
- [`docs/SDS.md`](docs/SDS.md) — technical design (DB schema, API contracts, architecture)
- [`docs/TICKETS.md`](docs/TICKETS.md) — the ticket-by-ticket build log
- [`AGENTS.md`](AGENTS.md) — conventions for AI coding tools working in this repo
- [`openspec/`](openspec/) — the spec-driven proposal/design/tasks artifacts behind every ticket
