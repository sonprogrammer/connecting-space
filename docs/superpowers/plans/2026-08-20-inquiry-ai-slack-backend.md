# Inquiry AI Reply and Slack Automation Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation that atomically accepts inquiries, generates grounded AI reply drafts, stores them, and sends retryable privacy-minimized Slack notifications.

**Architecture:** Supabase PostgreSQL owns the durable job queue, locking, idempotency, and RLS boundaries. Next.js Route Handlers expose public/admin/internal contracts, while focused server modules call OpenAI Responses API and Slack Incoming Webhooks through dependency-injected fetch clients. `POST /api/inquiries` commits the inquiry and first job through one service-role RPC, returns `201`, then invokes one best-effort worker pass with Next.js `after()`.

**Tech Stack:** Next.js 16.2.11 Route Handlers and `after()`, TypeScript 5, Zod 4, Supabase JS 2, PostgreSQL migrations/RLS/functions, OpenAI Responses API structured outputs, Slack Incoming Webhooks, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-17-inquiry-ai-slack-automation-design.md`

## Global Constraints

- Implement backend files only; do not modify public or admin UI components.
- Store no API keys or webhook URLs in Git, PostgreSQL, API responses, or logs.
- Do not expose `ai_guidance`, prompts, internal errors, email, phone, or full inquiry text through public APIs or Slack.
- Attempt each automation job at most 3 times; reclaim expired processing locks and prevent duplicate active jobs.
- Persist the AI draft before creating or sending the Slack notification job.
- Apply the committed migration to the currently linked Supabase project only after local checks pass, then report schema and row values.

---

### Task 1: Database queue, content, drafts, delivery schema

**Files:**
- Create: `supabase/migrations/202608200001_inquiry_ai_slack_automation.sql`
- Modify: `src/shared/types/database.generated.ts`
- Test: `tests/automation-migration.test.ts`

**Interfaces:**
- Produces: tables `service_offerings`, `faq_items`, `inquiry_reply_drafts`, `automation_jobs`, `notification_deliveries`; RPCs `create_inquiry_with_automation`, `claim_automation_jobs`, `enqueue_automation_job`; queue and draft enums.

- [ ] Write a migration contract test that reads the SQL and asserts table definitions, checks, indexes, RLS, admin policies, revoked function execution, active-job uniqueness, lock reclaim, and atomic inquiry/job creation.
- [ ] Run `npm test` and verify the migration test fails because the migration is absent.
- [ ] Add the migration with five tables, updated-at triggers, indexes, RLS policies, grants/revokes, and security-definer RPCs whose `search_path` is fixed.
- [ ] Extend the hand-maintained `Database` type with exact new rows, inserts, updates, enums, and RPC signatures.
- [ ] Run `npm test` and `npm run type-check` and verify both pass.

### Task 2: Shared content contracts and public/admin APIs

**Files:**
- Create: `src/entities/automation/schemas/content.schema.ts`
- Create: `src/entities/automation/api/contracts.ts`
- Create: `src/app/api/service-offerings/route.ts`
- Create: `src/app/api/faqs/route.ts`
- Create: `src/app/api/admin/service-offerings/route.ts`
- Create: `src/app/api/admin/service-offerings/[id]/route.ts`
- Create: `src/app/api/admin/faqs/route.ts`
- Create: `src/app/api/admin/faqs/[id]/route.ts`
- Test: `tests/automation-content-schema.test.ts`
- Test: `tests/automation-content-api.test.ts`

**Interfaces:**
- Produces: camelCase public/admin response DTOs and Zod create/update inputs; public GET returns published safe fields only; admin routes use `getVerifiedAdminSupabase`.

- [ ] Write failing schema tests for trimming, slug format, nonnegative prices/order, price range order, JSON string arrays, required create fields, and nonempty patch payloads.
- [ ] Implement minimal Zod schemas and mapping helpers, then make schema tests pass.
- [ ] Write failing API tests for safe ordered public projections, authentication, collection creation, detail lookup, patch behavior, duplicate slug conflicts, and missing rows.
- [ ] Implement the six Route Handler groups using existing JSON response/auth patterns and make API tests pass.
- [ ] Run the full test suite and type-check.

### Task 3: AI structured response and privacy-safe Slack message

**Files:**
- Create: `src/entities/automation/model/reply.ts`
- Create: `src/shared/lib/automation/openai.ts`
- Create: `src/shared/lib/automation/slack.ts`
- Modify: `src/shared/config/env.ts`
- Modify: `.env.example`
- Test: `tests/automation-openai.test.ts`
- Test: `tests/automation-slack.test.ts`
- Test: `tests/automation-env.test.ts`

**Interfaces:**
- Produces: `generateInquiryReply(input, options)`, `buildInquiryReplyPrompt(input)`, `buildSlackMessage(input)`, `sendSlackNotification(input, options)`, and `assertAutomationEnv()`.

- [ ] Write failing tests that require strict `summary`, `draft`, and `needsConfirmation` validation; `store: false`; JSON Schema structured output; DB-only grounding rules; and safe API error summaries.
- [ ] Implement the OpenAI Responses API client with injected `fetch`, extract `output_text`, validate through Zod, and return usage/model metadata.
- [ ] Write failing tests proving Slack blocks include only allowed customer/business fields and never include email, phone, full inquiry text, or webhook URL; require non-2xx responses to fail safely.
- [ ] Implement Slack block/message construction and webhook sending with injected `fetch`.
- [ ] Add exact environment validation for `OPENAI_API_KEY`, `OPENAI_INQUIRY_REPLY_MODEL`, `SLACK_INQUIRY_WEBHOOK_URL`, `AUTOMATION_PROCESS_SECRET`, and `ADMIN_BASE_URL`, and document names without values.
- [ ] Run targeted and full tests.

### Task 4: Durable automation worker

**Files:**
- Create: `src/shared/lib/automation/errors.ts`
- Create: `src/shared/lib/automation/processor.ts`
- Test: `tests/automation-processor.test.ts`

**Interfaces:**
- Produces: `processAutomationJobs({ limit, workerId, dependencies })` and `processAutomationJob(job, dependencies)`.
- Consumes: queue RPCs, content tables, inquiry table, AI client, Slack client, draft/history/delivery tables.

- [ ] Write failing tests for claim limits, AI success persistence order, generation history, Slack job enqueue only after draft save, Slack delivery idempotency, expired-lock claims, exponential retry timestamps, third-attempt failure, and redacted errors.
- [ ] Implement the processor with dependency injection and explicit handlers for `generate_inquiry_reply` and `send_slack_notification`.
- [ ] Ensure AI final failure marks the draft failed while Slack final failure preserves the ready draft and marks delivery failed.
- [ ] Run targeted and full tests plus type-check.

### Task 5: Inquiry, internal recovery, and admin draft APIs

**Files:**
- Modify: `src/app/api/inquiries/route.ts`
- Create: `src/app/api/internal/automation/process/route.ts`
- Create: `src/app/api/admin/inquiries/[id]/reply-draft/route.ts`
- Create: `src/app/api/admin/inquiries/[id]/reply-draft/regenerate/route.ts`
- Create: `src/app/api/admin/inquiries/[id]/notifications/slack/retry/route.ts`
- Test: `tests/inquiry-automation-api.test.ts`
- Test: `tests/automation-admin-api.test.ts`
- Test: `tests/automation-internal-api.test.ts`

**Interfaces:**
- Public inquiry POST calls `create_inquiry_with_automation`, returns `{ id, status: "new" }` with 201, then schedules one worker pass using `after()`.
- Internal POST requires `Authorization: Bearer <AUTOMATION_PROCESS_SECRET>` and clamps the batch size.
- Admin routes read/update current draft and enqueue idempotent regeneration/retry jobs.

- [ ] Write failing tests for atomic RPC payload mapping, immediate response independent of worker result, safe database failure, and after-callback scheduling.
- [ ] Modify the inquiry route minimally to pass those tests.
- [ ] Write failing internal endpoint tests for missing/wrong/correct secrets and bounded processing.
- [ ] Implement the internal endpoint with constant-time secret comparison and safe response errors.
- [ ] Write failing admin API tests for auth, missing inquiry/draft, safe draft patch, duplicate-safe regeneration, and Slack retry only for a ready draft.
- [ ] Implement admin endpoints using existing auth and response conventions.
- [ ] Run full tests, lint, type-check, and build.

### Task 6: Apply and verify linked Supabase migration

**Files:**
- No new files; use the committed migration and Supabase CLI.

**Interfaces:**
- Consumes: linked project reference from local Supabase configuration/authentication.
- Produces: remote schema matching `202608200001_inquiry_ai_slack_automation.sql`.

- [ ] Inspect the linked project reference and remote migration status without printing secrets.
- [ ] Run a dry-run migration push if supported by the installed CLI and confirm only the new migration is pending.
- [ ] Apply the migration once to the linked project; do not seed fabricated pricing, schedule, or FAQ business facts.
- [ ] Query safe metadata/counts through the configured service-role client and report table columns, constraints/RLS presence, and row counts/values without exposing secrets or customer data.
- [ ] Re-run unit tests, lint, type-check, and production build after migration application.

### Task 7: Review, commit, push, and PR

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-inquiry-ai-slack-backend.md` only if execution reveals an approved plan correction.

**Interfaces:**
- Produces: pushed `feat/issue-26-inquiry-automation-backend` branch and a PR linked to issue #26.

- [ ] Review the diff against every issue #26 completion condition and scan for secrets, frontend changes, unsafe error leakage, and missing tests.
- [ ] Run fresh `npm run lint`, `npm run type-check`, `npm test`, and `npm run build` commands and record exact outcomes.
- [ ] Commit focused changes, push the branch, and create the PR with first line exactly `[Back Agent / 백엔드 에이전트]`.
- [ ] In the PR body document migration/environment names, normal flow, OpenAI failure, Slack failure, lock expiry, duplicate execution, and remote DB application evidence; include `Closes #26`.
