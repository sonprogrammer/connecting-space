# Quote Version and Approval Backend Design

## Context

Issue #60 introduces the backend boundary for the quote approval flow defined by epic #57. It must support inquiries received outside the website, immutable sent quote versions, expiring approval links, and an explicit customer approval action. Email delivery, customer-facing UI, signed-contract handling, and project/payment creation remain in follow-up issues.

## Goals

- Let an authenticated admin create an inquiry received outside the website.
- Store quote copy, scope, total amount, schedule, and deposit/balance terms as versioned snapshots.
- Issue, replace, and revoke a seven-day approval token without storing its plaintext.
- Return a minimal public quote snapshot from a read-only GET endpoint.
- Approve one exact quote version only through an explicit POST endpoint.
- Preserve an audit record and allow only one successful approval under concurrent requests.
- Prevent mutation of an approved version; changes after approval create a new version.
- Enforce admin-only table access while exposing only narrowly scoped public database functions.

## Non-goals

- No admin or customer UI.
- No email delivery or Resend integration.
- No automatic expiry reminder.
- No contract PDF, signature confirmation, customer/project conversion, or payment creation.
- No remote Supabase migration. Migration verification is local only.

## Data Model

### `quotes`

One lifecycle record per quote:

- `id uuid` primary key
- `inquiry_id uuid` required foreign key to `inquiries`
- `status quote_status` with `draft`, `sent`, `approved`, `expired`, `cancelled`
- `latest_version_id uuid` nullable self-owned version reference
- `approved_version_id uuid` nullable self-owned version reference
- `created_by uuid` required admin reference
- `created_at`, `updated_at timestamptz`

An inquiry may have multiple quotes, but each quote owns an ordered version sequence. `approved_version_id` is assigned only by the approval transaction. Cancellation is terminal for the current quote approval flow.

### `quote_versions`

An immutable customer-facing snapshot:

- `id uuid` primary key
- `quote_id uuid` required foreign key
- `version_number integer` required and unique within a quote
- `title text`, `body text`
- `scope_items jsonb` containing a non-empty JSON string array
- `total_amount integer` in KRW, greater than zero
- `estimated_start_date date` nullable
- `estimated_end_date date` nullable and not earlier than the start date
- `deposit_amount integer`, `balance_amount integer`, both non-negative and summing to `total_amount`
- `deposit_terms text`, `balance_terms text`
- `created_by uuid` required admin reference
- `created_at timestamptz`

Rows are never updated or deleted through normal application roles. A database trigger rejects updates after creation. Corrections always create the next numbered version through an admin-only RPC that locks the parent quote and assigns `max(version_number) + 1` atomically.

### `quote_approval_tokens`

- `id uuid` primary key
- `quote_version_id uuid` required foreign key
- `token_hash text` unique SHA-256 hex digest; plaintext is never stored
- `expires_at timestamptz` exactly seven days after issue time
- `revoked_at`, `used_at timestamptz` nullable
- `replaced_by_id uuid` nullable self-reference
- `created_by uuid` required admin reference
- `created_at timestamptz`

Only one active token may exist for a version. Issuing a replacement locks and revokes the previous active token in the same transaction. The server generates 32 random bytes and returns the base64url plaintext once; only its SHA-256 digest enters the RPC and database.

### `quote_approvals`

- `id uuid` primary key
- `quote_id uuid` required foreign key
- `quote_version_id uuid` required foreign key and unique
- `approval_token_id uuid` required foreign key and unique
- `approved_at timestamptz`
- `client_ip inet` nullable
- `user_agent text` nullable and length-limited by the API

The row is append-only. A version and token can each appear in only one approval, while a quote can retain approvals for multiple historical versions. It records no token plaintext and no additional customer personal data.

## State and Integrity Rules

- New quotes start as `draft` with version 1.
- Issuing a token moves `draft` or `expired` to `sent`. Reissuing for a currently sent version keeps it `sent`.
- Public GET derives an expired result from token time without changing database state.
- An admin token operation may persist `expired` before issuing a replacement.
- Cancelling, replacing, expiring, or consuming a token makes it unusable.
- Approval locks the token, version, and quote rows in one transaction, rechecks every condition, inserts one audit row, marks the token used, and sets the quote to `approved` with `approved_version_id`.
- Only a token for the quote's latest version can approve it.
- `approved` and `cancelled` quotes reject approval. A repeated POST returns a stable conflict response and does not reveal whether another caller won a race.
- Creating a new version revokes any active token for the prior version. For an approved quote, it clears `approved_version_id` and returns the quote to `draft` while retaining the append-only prior approval audit.
- Database constraints enforce amounts and date ordering independently of API validation.

## Database Security

- Enable RLS on all four tables.
- Authenticated admins receive CRUD only where required; anonymous and ordinary authenticated users receive no direct table access.
- Revoke table privileges from `anon`; grant only required privileges to `authenticated` and `service_role`.
- Public access is limited to two `security definer` RPCs with fixed `search_path`, explicit grants, and no dynamic SQL:
  - a read-only lookup by token digest returning the allowed snapshot or a coarse token state;
  - an atomic approval by token digest returning an approved/conflict/invalid outcome.
- Admin RPCs call `is_admin()` and are granted only to `authenticated` and `service_role`.
- Error responses and logs never include token values, hashes, customer email, phone, or raw database error messages.

## API Contracts

All admin endpoints use the existing admin bearer/session verification. Inputs use camelCase and database payloads use snake_case.

### `POST /api/admin/inquiries`

Creates a manually received inquiry. It accepts customer/contact/company/site fields, `serviceType`, optional budget and launch date, required `message`, optional `source`, and optional admin notes. `source` defaults to `admin_manual`. It reuses the public inquiry field constraints but does not expose public anonymous insertion behavior.

### `POST /api/admin/quotes`

Accepts `inquiryId` plus the complete version snapshot. One admin RPC creates the quote and version 1 atomically. Returns the quote and created version.

### `GET /api/admin/quotes/[id]`

Returns the quote, ordered version history, token metadata without hashes, and approval audit metadata. Missing or RLS-hidden rows return 404.

### `POST /api/admin/quotes/[id]/cancel`

Atomically moves a non-cancelled quote to `cancelled` and revokes every active token owned by it. Repeating the operation is idempotent. An approved quote retains its approval audit and approved version reference for history, but no token can be used afterward.

### `POST /api/admin/quotes/[id]/versions`

Accepts a complete snapshot and creates the next immutable version through an RPC. It revokes an active old-version token. Returns 404 for a missing quote and 409 for a cancelled quote or other invalid transition.

### `POST /api/admin/quote-versions/[id]/approval-token`

Generates a new high-entropy token in the server runtime, stores only its digest through an admin RPC, and returns `{ token, expiresAt }` exactly once. Repeating this operation replaces and revokes the previous active token.

### `DELETE /api/admin/quote-versions/[id]/approval-token`

Revokes the active token idempotently. It returns success when no active token remains and never returns token material.

### `GET /api/quotes/[token]`

Hashes the path token and performs a read-only RPC. A valid token returns only quote id, version id/number, customer display name, title, body, scope, amount, schedule, payment terms, and expiry. Invalid, revoked, replaced, used, expired, cancelled, and unknown tokens return a stable unavailable response without customer data. No status mutation occurs.

### `POST /api/quotes/[token]/approve`

Hashes the token and invokes the atomic approval RPC. It optionally records a sanitized/truncated User-Agent and a trusted platform-provided client IP. It returns the approved quote/version ids and approval time on success. Invalid or stale tokens return a stable 409/410-style domain error without revealing token hashes or internal row state.

## Validation and Error Handling

- UUIDs, dates, money, string lengths, and the complete scope array are validated with Zod before database calls.
- Amounts must be safe integers and `depositAmount + balanceAmount === totalAmount`.
- The public token must decode as exactly 32 bytes of base64url data before hashing.
- API responses use existing `jsonOk`/`jsonError` envelopes and stable domain codes.
- Expected PostgreSQL/RPC states map to 400, 404, 409, or 410. Unexpected failures return a generic 500 message.
- No route logs request bodies, authorization headers, tokens, hashes, or raw Supabase errors.

## Generated Types and Boundaries

- Regenerate/update `src/shared/types/database.generated.ts` for the migration schema and RPC signatures.
- Add backend-owned quote schemas and API contracts under `src/entities/quote`.
- Keep route handlers thin; token generation/hashing and error mapping live in backend-only helpers under `src/entities/quote/server`.
- Do not modify `src/app/(public)`, `src/app/admin`, widgets, UI components, styles, or frontend state models.

## Testing

TDD covers each new behavior before implementation.

- Schema tests: snapshot normalization, invalid ranges, amount mismatch, date ordering, manual inquiry defaults, exact token format.
- Route tests: authentication, safe error mapping, RPC payloads, one-time plaintext response, public field allowlist, and GET remaining mutation-free.
- Migration contract tests: tables, constraints, immutable trigger, RLS, grants, and RPC security declarations.
- Local Supabase integration tests: admin versus anon table access, version numbering and locking, seven-day expiry, replacement/revocation, approved-version immutability, new-version behavior, minimal public lookup, and two concurrent approval calls producing exactly one approval.
- Full checks: lint, type-check, entire test suite, and production build.

The integration test refuses to run unless the Supabase URL hostname is `127.0.0.1` or `localhost`. The migration is applied only to local Supabase; no linked or remote database push is permitted.

## QA Handoff

The issue and PR will document:

- local Supabase start/reset commands and integration-test environment flag;
- admin setup and API request order for manual inquiry, quote, token, GET, POST approval, replacement, expiry, and cancellation checks;
- expected status codes and invariants;
- checks that public responses omit token hashes and contact data;
- explicit confirmation that no remote migration was applied.
