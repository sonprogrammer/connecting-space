# Quote Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 단일 `/send` 요청에서 승인 토큰과 암호화 발송 작업을 원자 생성하고, Resend 성공 뒤 견적 상태와 7일 만료를 확정하며 retry·재발급·만료 Slack 알림을 멱등하게 처리한다.

**Architecture:** 기존 문의 자동화 큐와 분리된 `quote_email_deliveries`, `quote_expiration_alerts` 아웃박스를 후속 migration으로 추가한다. 서버는 AES-256-GCM 암호화 payload와 Resend 고정 idempotency key를 사용하고, DB RPC가 enqueue/claim/finalize/retry/lifecycle 상태 전이를 담당한다. 기존 내부 automation endpoint와 GitHub Actions cron은 두 processor의 진입점만 공유한다.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript 5, Supabase/PostgreSQL RPC·RLS, Node `crypto`, Resend HTTP API, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-07-quote-email-delivery-design.md`

## Global Constraints

- 원격 Supabase DB와 운영 데이터는 변경하지 않는다.
- DB reset, 데이터 삭제, 테스트 데이터의 원격 생성은 하지 않는다.
- 토큰, 승인 URL, 수신 이메일, 메일 본문은 DB와 로그에 평문 저장하지 않는다.
- 견적은 Resend 성공 후 finalize RPC에서만 `sent`가 된다.
- 프론트엔드 파일은 수정하지 않는다.
- 실제 비밀값과 개인정보를 코드, fixture, 이슈, PR에 기록하지 않는다.

---

### Task 1: 견적 알림 데이터 모델과 원자적 RPC

**Files:**
- Create: `supabase/migrations/202609070001_quote_email_delivery.sql`
- Create: `tests/quote-email-migration.test.ts`
- Create: `tests/quote-email-delivery.integration.test.ts`
- Modify: `src/shared/types/database.generated.ts`

**Interfaces:**
- Produces: `enqueue_quote_email_delivery`, `claim_quote_email_deliveries`, `finalize_quote_email_delivery`, `fail_quote_email_delivery`, `retry_quote_email_delivery`, `schedule_quote_lifecycle`, `claim_quote_expiration_alerts`, `finalize_quote_expiration_alert`, `fail_quote_expiration_alert` RPC
- Produces: `quote_email_deliveries`, `quote_expiration_alerts` rows and `quote_delivery_status` enum

- [ ] **Step 1: Write failing migration contract tests**

Assert literal SQL contracts for both tables, RLS/grants, partial unique current-generation index, nullable pre-send token expiry, `for update skip locked`, service-role RPC grants, removal of the immediate `quotes.status = 'sent'` update from the replaced token RPC, and public RPC checks for `status = 'sent'` plus non-null expiry.

- [ ] **Step 2: Run RED**

Run: `npm test -- --test-name-pattern="견적 이메일 migration"`
Expected: FAIL because `202609070001_quote_email_delivery.sql` does not exist.

- [ ] **Step 3: Add the migration**

Implement enums, tables, constraints, RLS, indexes and RPCs. `enqueue_quote_email_delivery` accepts pre-generated job/token IDs, token hash and ciphertext parts, locks the quote, returns an existing current job for duplicate calls, returns `retry_required` for a valid failed job, and creates the next generation only after an invalid old token is superseded. `finalize_quote_email_delivery` atomically persists provider ID, marks the quote sent and sets `expires_at = p_sent_at + interval '7 days'`.

- [ ] **Step 4: Run GREEN and add local integration cases**

Run: `npm test -- --test-name-pattern="견적 이메일 migration"`
Expected: PASS.

Add opt-in local PostgreSQL tests for duplicate enqueue, success-only sent transition, retry identity, expiration reissue generation, expiry transition and one-time Slack alert. Run against local Supabase only.

- [ ] **Step 5: Update generated database types and commit**

Run targeted tests, then commit migration, types and tests with `feat: 견적 이메일 발송 작업 스키마 추가`.

### Task 2: 암호화, 메일 렌더링, 공통 Resend provider

**Files:**
- Create: `src/shared/lib/email/encrypted-payload.ts`
- Create: `src/shared/lib/email/resend.ts`
- Create: `src/entities/quote/server/email-content.ts`
- Create: `tests/quote-email-crypto.test.ts`
- Create: `tests/quote-email-provider.test.ts`
- Create: `tests/quote-email-content.test.ts`
- Modify: `src/shared/config/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `encryptQuoteEmailPayload(payload, context, key)`, `decryptQuoteEmailPayload(envelope, context, key)`
- Produces: `sendTransactionalEmail(message, { apiKey, idempotencyKey, fetch })`
- Produces: `buildQuoteApprovalEmail(payload, publicBaseUrl)`

- [ ] **Step 1: Write failing crypto tests**

Use a literal 32-byte test key. Assert round-trip, different nonces for identical plaintext, and failures for wrong key, modified tag, modified job/version/token AAD.

- [ ] **Step 2: Run RED, implement minimal AES-256-GCM, run GREEN**

Run: `npm test -- --test-name-pattern="견적 이메일 암호화"`.
Implement 12-byte random nonce and AAD JSON `['quote-email-v1', jobId, quoteVersionId, approvalTokenId]`.

- [ ] **Step 3: Write failing content/provider tests**

Assert escaped customer-controlled strings, customer name, quote summary, seven-day expiry label and CTA in HTML/text. Assert Resend `Authorization`, JSON body and `Idempotency-Key: quote-approval/{jobId}`, provider ID parsing, retry classification, and error redaction.

- [ ] **Step 4: Implement common provider and renderer, run GREEN**

Use `fetch('https://api.resend.com/emails')`; never include response bodies, email addresses or keys in thrown errors. Validate `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_EMAIL_ENCRYPTION_KEY`, `QUOTE_PUBLIC_BASE_URL` independently in `env.ts`.

- [ ] **Step 5: Commit**

Commit with `feat: 암호화 견적 메일 provider 추가`.

### Task 3: 관리자 `/send`와 수동 retry API

**Files:**
- Create: `src/app/api/admin/quote-versions/[id]/send/route.ts`
- Create: `src/app/api/admin/quote-email-jobs/[id]/retry/route.ts`
- Create: `src/entities/quote/server/email-payload.ts`
- Create: `src/entities/quote/server/email-contracts.ts`
- Create: `tests/quote-email-api.test.ts`
- Modify: `src/entities/quote/api/contracts.ts`
- Modify: `src/entities/quote/index.ts`
- Modify: `src/app/api/admin/quotes/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1 RPC/types and Task 2 encryption
- Produces: admin job response with `jobId`, quote/version/token IDs, generation, status, attempts, timing, safe error code and expiration alert status

- [ ] **Step 1: Write failing `/send` tests**

Assert unauthenticated 401, invalid UUID 400, missing/invalid recipient 400 before enqueue RPC, new 202, duplicate active/sent 200, valid failed job 409 retry required, no plaintext token/URL/email/body in response, and trusted `QUOTE_PUBLIC_BASE_URL` usage.

- [ ] **Step 2: Run RED, implement `/send`, run GREEN**

Generate job/token IDs and token locally, build one immutable payload, encrypt it, pass only hash+ciphertext to `enqueue_quote_email_delivery`, and map stable RPC result codes.

- [ ] **Step 3: Write retry API tests and run RED**

Assert failed job 202 with unchanged IDs, active/sent job 200, invalid/expired/revoked token 409 reissue required, approved/cancelled quote 409 unavailable and missing job 404.

- [ ] **Step 4: Implement retry and admin detail status, run GREEN**

Call only `retry_quote_email_delivery`; do not decrypt or rotate payload. Extend quote detail reads with safe delivery and expiration alert columns only.

- [ ] **Step 5: Commit**

Commit with `feat: 견적 메일 발송 및 재시도 API 추가`.

### Task 4: 견적 이메일 worker와 만료 Slack 처리

**Files:**
- Create: `src/shared/lib/automation/quote-notification-processor.ts`
- Create: `src/entities/quote/server/expiration-slack.ts`
- Create: `tests/quote-notification-processor.test.ts`
- Create: `tests/quote-expiration-slack.test.ts`
- Modify: `src/shared/lib/automation/process-route.ts`
- Modify: `tests/automation-process-route.test.ts`

**Interfaces:**
- Consumes: claim/finalize/fail/lifecycle RPCs, encrypted payload module, Resend provider and existing Slack webhook sender
- Produces: `processQuoteNotifications({ client, fetch, now, workerId })`

- [ ] **Step 1: Write failing worker tests**

Assert successful send/finalize, retry and terminal failure, invalid token before provider call, corrupted ciphertext safe failure, and Resend success followed by finalize failure causing the next run to send the exact same payload and idempotency key before successful finalize.

- [ ] **Step 2: Run RED, implement email worker, run GREEN**

Claim rows, validate current token state from the RPC result, decrypt with row-derived AAD, render, send, and call finalize/fail RPCs. Store only safe error codes.

- [ ] **Step 3: Write failing lifecycle and Slack tests**

Assert schedule RPC runs before claims, a token gets one Slack job, invalid token states are excluded, message contains only safe quote/version/expiry/admin-link data, and no customer reminder email provider call occurs.

- [ ] **Step 4: Implement lifecycle/Slack worker and integrate process route**

Call the quote processor independently so failures do not damage existing inquiry jobs. Missing quote-email configuration returns a stable safe result without exposing secret names to unauthorized callers.

- [ ] **Step 5: Run existing automation regression tests and commit**

Commit with `feat: 견적 메일 및 만료 알림 작업 처리`.

### Task 5: 로컬 DB 검증, 문서, 전체 품질 게이트와 PR

**Files:**
- Create: `docs/qa/issue-62-quote-email.md`
- Modify only if required by verification: backend tests/types/config files already listed

**Interfaces:**
- Produces: QA runbook without real secrets or recipients

- [ ] **Step 1: Start local Supabase and apply migrations locally**

Use an isolated local Supabase workdir/config if the repository link metadata could target remote. Never run `--linked`, `db push`, remote reset or remote data writes.

- [ ] **Step 2: Run local integration tests**

Set only local DB URLs/keys and disposable fake data. Confirm integration cleanup is local-only.

- [ ] **Step 3: Write QA guide**

Document env variable names, fake Resend/manual injection procedure, `/send` 202/200/409 cases, retry, success-only sent transition, expiry/Slack verification and expected safe response fields.

- [ ] **Step 4: Run fresh complete verification**

Run `npm run lint`, `npm run type-check`, `npm test`, `npm run build`, `git diff --check`, and local migration verification. Read every exit code before claiming success.

- [ ] **Step 5: Request code review and resolve findings**

Review the complete diff against issue #62, planner conditions and this plan. Fix all critical/important findings with targeted regression tests, then rerun the full gate.

- [ ] **Step 6: Push and open PR**

Push `backend/issue-62-quote-email`, create a Korean PR targeting `main`, do not merge it, and include migration warning, configuration names, tests and QA steps.

- [ ] **Step 7: Comment on issue #62**

Post the PR link, implementation summary, verification evidence and QA guide link in Korean with `**[Back Agent / 백엔드 에이전트]**` as the first line.
