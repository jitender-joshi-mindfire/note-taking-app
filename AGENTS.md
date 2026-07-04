# AGENTS.md

## 1. Project Overview

A full-stack note-taking app where authenticated users create, organize, search, and share
notes. Six feature areas: Auth, Notes CRUD, Tags, Search, Sharing, and Version History (see
`docs/FRS.md`). This file is the single source of truth for all AI tools on this team.

## 2. Repository Structure

- `backend/` — Express 5 REST API (TypeScript, ESM), owns PostgreSQL via Prisma
  - `src/` — routes, services, middleware (added as tickets land)
  - `prisma/schema.prisma` — database schema and migrations
- `frontend/` — React 19 SPA (Vite), consumes the backend REST API
  - `src/` — components, pages, hooks (added as tickets land)
- `packages/shared/` — the ONLY place TypeScript types and Zod schemas live; imported by both
  `backend` and `frontend`
- `docs/FRS.md` — Functional Requirements Spec (business truth — WHAT to build)
- `docs/SDS.md` — Software Design Spec (technical truth — schema, API contracts, architecture)
- `docs/decisions/` — Architecture Decision Records
- `openspec/` — per-ticket living specs (proposal → plan → tasks → archive)
- `.claude/commands/`, `.claude/agents/` — slash commands and sub-agents for this workflow

## 3. Tech Stack

- Frontend: React 19 + TypeScript + Vite + TanStack Query + Zustand + TipTap + shadcn/ui
- Backend: Node.js 22 + Express 5 + TypeScript (ESM)
- Database: PostgreSQL 16 + Prisma ORM
- Auth: JWT access token (15 min) + refresh token (7 days, DB-persisted, rotated on use)
- Search: PostgreSQL full-text search (tsvector + GIN index) — no external search service
- Testing: Vitest + Supertest (backend), Vitest + Testing Library (frontend), Playwright (E2E)
- Monorepo: pnpm workspaces (`backend`, `frontend`, `packages/shared`)

## 4. Key Commands

- `pnpm install` — install all workspace dependencies
- `pnpm build` — build all workspaces (must be 0 errors, 0 warnings)
- `pnpm lint` — lint entire workspace (`--max-warnings 0`)
- `pnpm test` — run all tests (Vitest, all workspaces)
- `pnpm dev:backend` — run the Express API in watch mode
- `pnpm dev:frontend` — run the Vite dev server
- `npx playwright test` — run E2E tests (once configured in AB-1016)

## 5. Architecture Patterns

- Request flow: `frontend (TanStack Query) → REST API (Express) → Prisma → PostgreSQL`.
- Server state lives in TanStack Query; Zustand is for local/UI state only — never mirror server
  data into Zustand.
- Every resource (notes, tags, versions, share links) is strictly scoped to its owning user;
  cross-user access returns 404, never 403 (indistinguishable from not-found).
- Soft delete only: `deletedAt` timestamp on `Note`, never a physical row delete (30-day
  recovery window).
- Every note create/update snapshots a `NoteVersion` in the same transaction; restore re-applies
  old content through the normal update path so it produces a new version, never rewrites
  history.

## 6. Coding Standards

- Naming: camelCase for variables/functions, PascalCase for types/components, kebab-case for
  file names (except React components, which are PascalCase).
- Error responses: `{ error: { code, message, fields? } }` — see `docs/SDS.md` Section 9 for the
  full status-code table.
- No `console.log` in committed backend code except the OTP dev-logging path (`docs/SDS.md`
  Section 4) — use a real logger for anything else.
- All cross-cutting types/Zod schemas belong in `packages/shared` — see Section 12.

## 7. Auth Approach

- Passwords hashed with bcrypt (cost 12); never logged, never returned in API responses.
- Access token: JWT HS256, 15 min expiry, payload is just `{ sub: userId }`.
- Refresh token: opaque random token, only its hash stored in DB, rotated on every use; reuse of
  a rotated token revokes all of that user's refresh tokens.
- Password reset OTP: 6-digit, hashed, 10 min expiry, single-use, logged to console (no real
  email — out of scope).
- `requireAuth` middleware attaches `req.userId`; required on all `/notes`, `/tags`, `/search`
  routes. `/auth/*` and the public `/share/:token` route are unauthenticated.

## 8. API Design Conventions

- REST under `/api`, JSON in/out.
- Status codes: 400 validation, 401 auth failure, 404 not-found-or-not-owned, 409 conflict,
  410 gone (expired), 422 duplicate email, 500 unhandled.
- Pagination: `page`, `pageSize` query params; response shape
  `{ items[], total, page, pageSize }`.
- Full contract lives in `docs/SDS.md` Section 5 — do not invent new shapes without updating it
  first.

## 9. DB Schema Summary

- `User` → `RefreshToken[]`, `PasswordResetOtp[]`, `Note[]`, `Tag[]` (all cascade-deleted with
  the user)
- `Note` → `NoteVersion[]`, `Tag[]` (many-to-many), one optional `ShareLink`
- `Tag` is unique per `(userId, name)`; note counts computed via Prisma `_count`, never
  denormalized
- `ShareLink` is 1:1 with `Note` (generating a new link replaces the old one)
- Full schema: `docs/SDS.md` Section 3 / `backend/prisma/schema.prisma`

## 10. Testing Approach

- Backend: Vitest + Supertest against a real (migrated) test PostgreSQL database — never mock
  the Prisma client.
- Frontend: Vitest + Testing Library, jsdom environment.
- E2E: Playwright, one full user journey (register → note → tag → search → share → version
  history).
- One test per FRS/spec scenario, named after the scenario. Target ≥80% coverage on new code.

## 11. Do NOT Do

- Do not build real-time collaborative editing, file/image attachments, a mobile app,
  OAuth/social login, note folders/nesting, or real email sending — all explicitly out of scope
  (`docs/FRS.md` Section 2.2).
- Do not physically delete a `Note` row — soft delete only.
- Do not duplicate types/schemas outside `packages/shared`.
- Do not invent API shapes or status codes not in `docs/SDS.md` — update the SDS first.
- Do not read-then-write the share link view counter — always use an atomic DB increment.

## 12. Shared Packages

- `packages/shared/src/` is the single source of truth for TypeScript types and Zod validation
  schemas used by both `backend` and `frontend`.
- To add a new shared item: add it under `packages/shared/src/`, export it from
  `packages/shared/src/index.ts`, then import it via `@note-taking-app/shared` from either app —
  never redefine it locally.
