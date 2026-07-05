# Software Design Specification (SDS)

## Note Taking App

This document is the source of technical truth. Every `/plan` must conform to the schema, API
contracts, and architecture decisions below. Changes to this document are architecture decisions
and should be logged in `docs/decisions/`.

---

### 1. Architecture Overview

pnpm monorepo, three workspaces:

```
frontend/       → React 19 SPA (Vite), talks to backend/ over REST/JSON
backend/        → Express 5 API, owns the PostgreSQL database via Prisma
packages/shared → Zod schemas + TS types consumed by both apps (single source of truth)
```

Request flow: `frontend (TanStack Query) → REST API (Express) → Prisma → PostgreSQL 16`.
Auth is stateless-at-the-edge (JWT access token in `Authorization: Bearer`) with a stateful
refresh token stored server-side for revocation.

### 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + TanStack Query + Zustand + TipTap + shadcn/ui | Zustand for local/UI state only; server state lives in TanStack Query |
| Backend | Node.js 22 + Express 5 + TypeScript | ESM throughout |
| Database | PostgreSQL 16 + Prisma ORM | Prisma migrations are the only way schema changes |
| Auth | JWT access (15 min) + refresh token (7 days, DB-persisted) | HS256, secret from env |
| Search | PostgreSQL full-text search | `tsvector` + GIN index, no external service |
| Testing | Vitest + Supertest + Playwright | Unit/integration backend, component + E2E frontend |
| Monorepo | pnpm workspaces | `packages/shared` for cross-cutting types |

### 3. Database Schema (Prisma)

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  notes         Note[]
  tags          Tag[]
  refreshTokens RefreshToken[]
  resetOtps     PasswordResetOtp[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  revokedAt DateTime?

  @@index([userId])
}

model PasswordResetOtp {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  otpHash   String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
}

model Note {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  content   String   // TipTap JSON, stored as text
  searchVector Unsupported("tsvector")?
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tags      Tag[]         @relation("NoteTags")
  versions  NoteVersion[]
  shareLink ShareLink?

  @@index([userId, deletedAt])
  @@index([searchVector], type: Gin)
}

model Tag {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  color     String?
  createdAt DateTime @default(now())

  notes     Note[]   @relation("NoteTags")

  @@unique([userId, name])
}

model NoteVersion {
  id        String   @id @default(uuid())
  noteId    String
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String
  content   String
  createdAt DateTime @default(now())

  @@index([noteId, createdAt])
}

model ShareLink {
  id         String   @id @default(uuid())
  noteId     String   @unique
  note       Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  token      String   @unique
  viewCount  Int      @default(0)
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
}
```

Design notes:

- **`searchVector`** is a generated `tsvector` column (title weighted `A`, content weighted `B`),
  maintained via a Postgres trigger created in a raw-SQL migration (Prisma cannot express
  generated tsvector columns natively) — this is an accepted architecture decision, log an ADR
  when the migration lands.
- **Tag note-count** (FRS 5.2.1) is computed via Prisma's `_count` on the `notes` relation, not a
  denormalized counter column.
- **`ShareLink` is one-to-one with `Note`** per FRS 7.1.3 (one active link per note — generating a
  new one replaces the old row rather than inserting a second).
- **Soft delete** (FRS 4.4) uses `deletedAt` on `Note` only. All queries for a user's notes MUST
  filter `deletedAt: null` unless explicitly querying trash/recovery.
- **Version retention** (FRS 8.5): keep the most recent **50** versions per note; when a 51st
  version is written, delete the oldest in the same transaction. This limit is a design decision,
  not a hard requirement — record any change in `docs/decisions/`.

### 4. Auth Design

- Passwords hashed with `bcrypt` (cost factor 12).
- **Access token:** JWT, HS256, 15 minute expiry, payload `{ sub: userId }` only — no PII.
- **Refresh token:** opaque random 32-byte token; only its SHA-256 hash is stored in
  `RefreshToken.tokenHash`. Rotated on every use (old row revoked, new row inserted) — refresh
  token reuse after rotation is treated as a compromise signal and revokes all of that user's
  refresh tokens.
- **OTP:** 6-digit numeric, hashed (SHA-256) before storage, 10 minute expiry, single-use
  (`usedAt` set on consumption). Logged to console as
  `[OTP] password reset for <email>: <code>` — no real email integration (FRS 3.4.2, assignment
  out-of-scope).
- **Middleware:** `requireAuth` validates the access token and attaches `req.userId`; all
  `/api/notes`, `/api/tags`, `/api/search` routes require it. `/api/share/:token` (public view)
  and `/api/auth/*` do not.

### 5. API Contracts

Base path `/api`. All authenticated routes require `Authorization: Bearer <accessToken>`.
Error body shape (Section 9) applies to every non-2xx response.

#### Auth

| Method & Path | Request | Success | Errors |
|---|---|---|---|
| `POST /auth/register` | `{ email, password }` | `201 { user, accessToken, refreshToken }` | `422` duplicate email; `400` validation (`fields[]`) |
| `POST /auth/login` | `{ email, password }` | `200 { user, accessToken, refreshToken }` | `401` invalid credentials |
| `POST /auth/logout` | `{ refreshToken }`, `Authorization: Bearer <accessToken>` required | `204` | `401` missing/invalid/expired access token, or refresh token not owned by caller |
| `POST /auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` | `401` invalid/expired/reused token |
| `POST /auth/forgot-password` | `{ email }` | `200` (always, no enumeration) | `400` invalid email format |
| `POST /auth/reset-password` | `{ email, otp, newPassword }` | `200` | `400` invalid password; `401` wrong OTP; `410` expired OTP |

#### Notes

| Method & Path | Request | Success | Errors |
|---|---|---|---|
| `POST /notes` | `{ title, content }` | `201 { note }` | `400` validation |
| `GET /notes` | query: `page, pageSize, sortBy, sortDir, tagIds[]` | `200 { items[], total, page, pageSize }` | `400` invalid query params |
| `GET /notes/:id` | — | `200 { note }` | `404` not found/not owned |
| `PATCH /notes/:id` | `{ title?, content? }` | `200 { note }` | `404`; `400` validation |
| `DELETE /notes/:id` | — | `204` (soft delete) | `404` |

#### Tags

| Method & Path | Request | Success | Errors |
|---|---|---|---|
| `POST /tags` | `{ name, color? }` | `201 { tag }` | `409` duplicate name |
| `GET /tags` | — | `200 { items: [{ ...tag, noteCount }] }` | — |
| `PATCH /tags/:id` | `{ name?, color? }` | `200 { tag }` | `404`; `409` duplicate name |
| `DELETE /tags/:id` | — | `204` | `404` |

#### Search

| Method & Path | Request | Success | Errors |
|---|---|---|---|
| `GET /search` | query: `q, page, pageSize` | `200 { items: [{ note, snippet }], total, page, pageSize }` | `400` missing/empty `q` |

`snippet` contains the matched text with matches wrapped in `<mark>…</mark>` (produced via
Postgres `ts_headline`, `StartSel`/`StopSel` configured to emit `<mark>`/`</mark>`).

#### Sharing

| Method & Path | Request | Success | Errors |
|---|---|---|---|
| `POST /notes/:id/share` | `{ expiresInDays }` | `201 { token, url, expiresAt }` | `404` note not found |
| `DELETE /notes/:id/share` | — | `204` | `404` no active link |
| `GET /share/:token` *(public, no auth)* | — | `200 { title, content, updatedAt }` | `404` unknown/revoked; `410` expired |

#### Version History

| Method & Path | Request | Success | Errors |
|---|---|---|---|
| `GET /notes/:id/versions` | — | `200 { items[] }` | `404` |
| `GET /notes/:id/versions/:versionId` | — | `200 { version }` | `404` |
| `POST /notes/:id/versions/:versionId/restore` | — | `201 { note }` (new current version created) | `404` |

### 6. Search Design (PostgreSQL FTS)

- `Note.searchVector` = `setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', content), 'B')`,
  maintained by an `AFTER INSERT OR UPDATE` trigger (raw SQL migration).
- GIN index on `searchVector`.
- Query parsing via `websearch_to_tsquery('english', :q)` — supports natural user input
  (quotes, `-exclude`, etc.) without the caller needing tsquery syntax knowledge.
- Ranking via `ts_rank`; results ordered by rank descending, ties broken by `updatedAt` desc.
- Highlighting via `ts_headline('english', content, websearch_to_tsquery('english', :q), 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2')`.

### 7. Sharing Design

- `token` = 32 bytes from `crypto.randomBytes`, base64url-encoded, stored and looked up as
  plaintext (it is a capability URL, not a credential compared against a hash — entropy alone
  makes it unguessable).
- View count increment MUST use an atomic DB update (`UPDATE ... SET viewCount = viewCount + 1`
  via `prisma.shareLink.update({ data: { viewCount: { increment: 1 } } })`) — never
  read-then-write in application code, to avoid lost updates under concurrent public views.
- Expiry and revocation are both checked on every public read: `revokedAt IS NULL AND expiresAt > now()`.

### 8. Version History Design

- On note create: insert one `NoteVersion` immediately after the `Note` row, same transaction.
- On note update: insert a `NoteVersion` capturing the **pre-update** `title`/`content` inside the
  same transaction as the update, then enforce the 50-version retention cap (Section 3).
- Restore: read the target `NoteVersion`, apply its `title`/`content` to the `Note` via the same
  update path used by `PATCH /notes/:id` (so a new version snapshot of the *previous* current
  state is taken automatically) — this satisfies FRS 8.4.1 ("restore as new version") without a
  separate code path.

### 9. Error Handling Conventions

All error responses share this shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable summary", "fields": [] } }
```

`fields` is present only for `400` validation errors, each entry `{ field, message }`.

Status code conventions used throughout:

| Code | Meaning |
|---|---|
| 400 | Validation error (malformed input) |
| 401 | Not authenticated / invalid credentials / invalid or reused token |
| 403 | Authenticated but not permitted (reserved; current features resolve to 404 instead — see FRS 4.2.2) |
| 404 | Not found, or not owned by caller (never distinguish the two) |
| 409 | Conflict (duplicate tag name) |
| 410 | Gone (expired OTP, expired share link) |
| 422 | Unprocessable — duplicate email on registration |
| 429 | Too many requests — rate limit exceeded (login/registration, FRS 3.5) |
| 500 | Unhandled server error |

### 10. Testing Approach

- **Backend unit/integration:** Vitest + Supertest against a real test PostgreSQL database
  (migrated fresh per test run) — no mocking Prisma.
- **Frontend component:** Vitest + Testing Library (jsdom environment, already configured).
- **E2E:** Playwright, one full user journey covering register → create note → tag → search →
  share → version history (ticket AB-1016).
- Coverage target: ≥80% on new code per ticket (Definition of Done).
- One test per FRS/spec scenario, named after the scenario (per the `test-writer` sub-agent
  contract).

### 11. Cross-Cutting Conventions

- All TypeScript types and Zod schemas live in `packages/shared` only — never duplicated in
  frontend or backend (Rule 11).
- CORS restricted to the frontend's dev/prod origin(s), configured via env var.
- All library/API usage verified against live docs via Context7 MCP before use — no hallucinated
  methods (Rule 9).
- All dependency versions pinned exactly in `package.json`; never `@latest` (Rule 20).

### 12. Open Architecture Decisions

Log these (and any future ones) as ADRs in `docs/decisions/` once decided/implemented:

1. Tsvector-trigger migration approach (Section 3).
2. Version retention limit of 50 (Section 3) — revisit if product requirements change.
3. Share token storage as plaintext vs. hashed (Section 7).
