# Functional Requirements Specification (FRS)

## Note Taking App

### 1. Overview

A full-stack note-taking application where authenticated users create, organize, search, and
share notes. Every note supports tagging, full-text search, shareable public read-only links,
and per-note version history. This document is the source of business truth — every ticket's
`/spec` proposal must trace back to a numbered requirement here.

### 2. Scope

#### 2.1 In Scope

1. Auth — register, login, logout, forgot/reset password via OTP
2. Notes CRUD — create, read, update, soft-delete, pagination, sorting, tag filters
3. Tags — user-scoped tags with note counts, color support
4. Search — full-text search with keyword highlighting
5. Sharing — generate/revoke public read-only links with expiry and view count
6. Version History — snapshot per save, view any version, restore as new version

#### 2.2 Out of Scope

Do not build these. Any attempt is a spec violation:

- Real-time collaborative editing
- File or image attachments
- Mobile app
- OAuth / social login
- Note folders or nesting
- Actual email sending (OTP and notifications are logged to console only)

---

### 3. Auth

#### 3.1 Registration

**Business rule:** Users register with email + password only. No social login.

**User story:** As a new user, I want to create an account with my email and password so I can
start taking notes.

**Acceptance criteria:**

- 3.1.1 — SHALL accept `email` and `password`; email MUST be unique (case-insensitive) and a
  valid email format.
- 3.1.2 — Password MUST be at least 8 characters, containing at least one letter and one number.
- 3.1.3 — On success, the password SHALL be hashed (never stored in plaintext) and the user
  logged in immediately (access + refresh token issued).
- 3.1.4 — Registration response MUST NOT include the password hash.

**Error scenarios:**

- Duplicate email → reject, do not reveal whether it's the email or something else that's taken
  beyond "email already registered".
- Invalid email format → reject with field-level error.
- Password fails complexity rule → reject with field-level error listing which rule failed.

#### 3.2 Login

**User story:** As a returning user, I want to log in with my email and password so I can access
my notes.

**Acceptance criteria:**

- 3.2.1 — SHALL accept `email` + `password`; on match, issue a short-lived access token and a
  long-lived refresh token.
- 3.2.2 — Failed login (wrong email or wrong password) MUST return the same generic error in
  both cases — never reveal which field was wrong.
- 3.2.3 — Refresh token SHALL be persisted server-side (DB) so it can be revoked.

**Error scenarios:**

- Wrong credentials → generic "invalid email or password" error, no field-level detail.
- Missing fields → validation error.

#### 3.3 Logout

**Acceptance criteria:**

- 3.3.1 — Logout SHALL revoke (delete or invalidate) the caller's refresh token server-side.
- 3.3.2 — After logout, the old refresh token MUST NOT be usable to obtain a new access token.

#### 3.4 Forgot Password / Reset via OTP

**Business rule:** No real email is sent. The OTP is logged to the server console for manual
retrieval during development/testing.

**User story:** As a user who forgot their password, I want to request a one-time code and use
it to set a new password.

**Acceptance criteria:**

- 3.4.1 — Requesting a reset for any email SHALL return the same success response whether or not
  the email exists (no account enumeration).
- 3.4.2 — If the account exists, a numeric OTP SHALL be generated, hashed before storage, and
  logged to console with the target email.
- 3.4.3 — OTP SHALL expire after a fixed short window; an expired OTP MUST be rejected.
- 3.4.4 — OTP SHALL be single-use — once consumed for a successful reset, it cannot be reused.
- 3.4.5 — On successful reset, all of the user's existing refresh tokens SHALL be revoked
  (force re-login on all devices).

**Error scenarios:**

- Expired OTP → reject, distinct status from "wrong OTP" is not required but message must be
  clear.
- Wrong/already-used OTP → reject.
- New password fails complexity rule (see 3.1.2) → reject with field-level error.

---

### 4. Notes CRUD

#### 4.1 Create

**Acceptance criteria:**

- 4.1.1 — SHALL accept `title` (required, non-empty) and `content` (rich text, may be empty).
- 4.1.2 — Created note SHALL belong to the authenticated user only.
- 4.1.3 — Creating a note SHALL create its first version snapshot (see Section 8).

#### 4.2 Read & List

**Acceptance criteria:**

- 4.2.1 — A user SHALL only ever read/list their own, non-deleted notes.
- 4.2.2 — Reading a single note that is soft-deleted or not owned by the caller SHALL return
  not-found (never leak existence).

#### 4.3 Update

**Acceptance criteria:**

- 4.3.1 — SHALL accept partial updates to `title` and/or `content`.
- 4.3.2 — Every update SHALL create a new version snapshot of the note's prior state before
  applying changes (see Section 8).
- 4.3.3 — Updating a note not owned by the caller SHALL return not-found.

#### 4.4 Soft Delete

**Acceptance criteria:**

- 4.4.1 — Delete SHALL be a soft-delete only — set a deleted timestamp, never physically remove
  the row.
- 4.4.2 — Soft-deleted notes SHALL disappear from all listing, search, and detail endpoints for
  the owner.
- 4.4.3 — Soft-deleted notes SHALL be recoverable for 30 days (out-of-scope for UI in this
  assignment, but the data model must support it — see SDS).
- 4.4.4 — Deleting a note SHALL revoke any active share link for that note (Section 7).

#### 4.5 Pagination & Sorting

**Acceptance criteria:**

- 4.5.1 — Listing notes SHALL support page-based pagination with a configurable page size and a
  sane default and maximum.
- 4.5.2 — Listing notes SHALL support sorting by `createdAt`, `updatedAt`, and `title`, ascending
  or descending.

#### 4.6 Tag Filtering

**Acceptance criteria:**

- 4.6.1 — Listing notes SHALL support filtering by one or more tag IDs (AND semantics: note must
  have all specified tags — see SDS for the alternative OR discussion if revisited).

---

### 5. Tags

#### 5.1 CRUD

**Acceptance criteria:**

- 5.1.1 — Tags SHALL be scoped per-user — no tag is shared across users.
- 5.1.2 — Tag `name` SHALL be unique per user (case-insensitive).
- 5.1.3 — Tags SHALL support an optional color value.
- 5.1.4 — Deleting a tag SHALL remove the tag-note association but MUST NOT delete the notes
  themselves.

**Error scenarios:**

- Duplicate tag name for the same user → reject.

#### 5.2 Note Count Per Tag

**Acceptance criteria:**

- 5.2.1 — Listing tags SHALL include a count of non-deleted notes currently associated with each
  tag.

---

### 6. Search

#### 6.1 Full-Text Search

**Acceptance criteria:**

- 6.1.1 — SHALL search across a note's `title` and `content` for the authenticated user's own,
  non-deleted notes only.
- 6.1.2 — SHALL use PostgreSQL full-text search — no external search service.

#### 6.2 Highlighting

**Acceptance criteria:**

- 6.2.1 — Each search result SHALL include a snippet with matched keywords highlighted (marked
  in a way the frontend can render, e.g. wrapped in a delimiter).

#### 6.3 Pagination

**Acceptance criteria:**

- 6.3.1 — Search results SHALL be paginated using the same convention as note listing
  (Section 4.5).

---

### 7. Sharing

#### 7.1 Generate Link

**Acceptance criteria:**

- 7.1.1 — Only the note owner SHALL be able to generate a public share link for a note.
- 7.1.2 — A share link SHALL have an expiry date/time set at creation.
- 7.1.3 — Generating a new link for a note that already has an active link SHALL replace the
  existing link (one active link per note).

#### 7.2 Revoke Link

**Acceptance criteria:**

- 7.2.1 — The owner SHALL be able to revoke an active share link at any time, immediately
  invalidating it.

#### 7.3 Public Access

**Acceptance criteria:**

- 7.3.1 — Anyone with a valid, non-expired, non-revoked share link SHALL be able to view the
  note **read-only**, without authentication.
- 7.3.2 — An expired or revoked link SHALL return an appropriate "gone/not found" response, not
  the note content.

#### 7.4 View Count

**Acceptance criteria:**

- 7.4.1 — Each successful public view SHALL atomically increment a view counter on the share
  link (no lost updates under concurrent access).
- 7.4.2 — The owner SHALL be able to see the current view count for their active link.

---

### 8. Version History

#### 8.1 Snapshot on Save

**Acceptance criteria:**

- 8.1.1 — Every create and every update SHALL produce an immutable version snapshot capturing
  `title`, `content`, and a timestamp.

#### 8.2 List Versions

**Acceptance criteria:**

- 8.2.1 — The owner SHALL be able to list all retained versions of a note, newest first.

#### 8.3 View Version

**Acceptance criteria:**

- 8.3.1 — The owner SHALL be able to view the full content of any retained version.

#### 8.4 Restore as New Version

**Acceptance criteria:**

- 8.4.1 — Restoring a prior version SHALL create a **new** current version/note state equal to
  the restored content — it SHALL NOT delete or reorder existing version history.

#### 8.5 Auto-Purge

**Acceptance criteria:**

- 8.5.1 — Version history SHALL be automatically purged beyond a retention limit to bound
  storage growth (exact limit is a design decision — see SDS Section 8 and
  `docs/decisions/`).

---

### 9. Non-Functional Requirements

- **Security:** passwords hashed (never logged or returned), JWT access tokens short-lived
  (15 min), refresh tokens persisted and revocable, no account enumeration on auth endpoints.
- **Data retention:** soft-deleted notes retained 30 days before permanent purge is eligible
  (purge job itself is out of scope for this assignment unless a ticket adds it explicitly).
- **Multi-tenancy:** every resource (notes, tags, versions, share links) is strictly scoped to
  its owning user; cross-user access must be indistinguishable from not-found.

### 10. Glossary

- **Soft delete:** marking a row as deleted via a `deletedAt` timestamp rather than removing it.
- **OTP:** one-time password, a short-lived numeric code used for password reset.
- **Share link:** an unauthenticated, read-only, revocable, expiring public URL for one note.
