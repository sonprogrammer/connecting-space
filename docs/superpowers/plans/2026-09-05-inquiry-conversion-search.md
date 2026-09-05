# 문의 전환 연결 무결성 및 검색 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문의 전환을 원자적으로 멱등 처리하고 관리자 고객·프로젝트 목록에 검색·필터·정렬·페이지네이션을 제공한다.

**Architecture:** 관리자 전환 route는 service-role Supabase RPC 한 번으로 고객·프로젝트 재사용/생성 및 문의 연결을 트랜잭션 처리한다. 목록 route는 공통 query parser로 검증한 뒤 기존 관리자 Supabase client의 count 쿼리를 사용하고, migration에는 RPC·인덱스·기존 데이터 보정 절차를 기록한다.

**Tech Stack:** Next.js 16 App Router Route Handlers, TypeScript, Zod, Supabase JS, PostgreSQL PL/pgSQL, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-inquiry-conversion-search-design.md`

## Global Constraints

- 관리자 API는 `getVerifiedAdminSupabase` 인증을 사용한다.
- 모든 payload/query는 Zod로 검증하고 안전한 도메인 오류 코드만 반환한다.
- 원격 Supabase에는 migration을 적용하지 않는다.
- 최신 `origin/main`에서 만든 `backend/issue-32-inquiry-conversion-search` 브랜치에서 작업한다.
- PR 생성 후 직접 merge하지 않는다.

---

### Task 1: 목록 query 계약과 공통 파서

**Files:**
- Create: `src/shared/api/list-query.ts`
- Modify: `src/entities/customer/api/contracts.ts`
- Modify: `src/entities/project/api/contracts.ts`
- Test: `tests/admin-list-query.test.ts`

**Interfaces:**
- Produces `parseListQuery(searchParams, options): { q, page, pageSize, sort, direction }` and `listResponse(items, meta)`.
- Customer sort fields: `created_at`, `name`, `company_name`; project sort fields: `created_at`, `name`, `status`, `expected_launch_date`.

- [ ] **Step 1: Write failing tests** for defaults, bounds, invalid numbers, invalid sort/direction, and response metadata.
- [ ] **Step 2: Run `node --test` for the new test and verify it fails because parser/response helpers do not exist.**
- [ ] **Step 3: Implement the parser with page default 1, pageSize default 20, max 100, and direction `asc|desc`; reject invalid values with a typed validation result.**
- [ ] **Step 4: Implement response metadata (`totalPages = ceil(total/pageSize)`, zero items => zero pages) and update entity list response types.**
- [ ] **Step 5: Run the focused test and verify it passes.**
- [ ] **Step 6: Commit:** `git add src/shared/api/list-query.ts src/entities/customer/api/contracts.ts src/entities/project/api/contracts.ts tests/admin-list-query.test.ts && git commit -m "feat: add admin list query contracts"`

### Task 2: 고객 목록 검색·페이지네이션 API

**Files:**
- Modify: `src/app/api/admin/customers/route.ts`
- Test: `tests/customer-api.test.ts` (or existing customer API test file)

**Interfaces:**
- `GET /api/admin/customers?q=&sort=&direction=&page=&pageSize=` returns `{ items, page, pageSize, total, totalPages }`.
- Search uses escaped `ilike` OR filters over `name`, `company_name`, `email`, `phone`, and `website_url`.

- [ ] **Step 1: Add failing route tests** asserting query forwarding, range calculation, count metadata, invalid query `400`, and auth before DB access.
- [ ] **Step 2: Run focused tests and verify failure against the current fixed-limit response.**
- [ ] **Step 3: Parse query with Task 1 helper; build selected columns, OR search filter, `order`, `range`, and `{ count: "exact" }` query; map DB errors to `ADMIN_CUSTOMERS_READ_FAILED`.**
- [ ] **Step 4: Return the typed paginated response and verify focused tests pass.**
- [ ] **Step 5: Commit:** `git add src/app/api/admin/customers/route.ts tests/customer-api.test.ts && git commit -m "feat: add customer search pagination"`

### Task 3: 프로젝트 목록 검색·상태 필터·페이지네이션 API

**Files:**
- Modify: `src/app/api/admin/projects/route.ts`
- Test: `tests/project-api.test.ts` (or existing project API test file)

**Interfaces:**
- `GET /api/admin/projects?q=&status=&sort=&direction=&page=&pageSize=` returns the same metadata shape.
- Search covers `name`, `description`; `status` accepts the project status enum.

- [ ] **Step 1: Add failing tests** for search, status filter, allowed sort fields, range/count, invalid status, and auth.
- [ ] **Step 2: Run focused tests and verify failure against the current fixed-limit response.**
- [ ] **Step 3: Implement validated filters and pagination, including deterministic secondary ordering by `created_at` and `id`; map errors to `ADMIN_PROJECTS_READ_FAILED`.**
- [ ] **Step 4: Run focused tests and verify they pass.**
- [ ] **Step 5: Commit:** `git add src/app/api/admin/projects/route.ts tests/project-api.test.ts && git commit -m "feat: add project search filtering"`

### Task 4: Atomic, idempotent inquiry conversion RPC and route

**Files:**
- Create: `supabase/migrations/202609050001_inquiry_conversion_integrity.sql`
- Create: `src/app/api/admin/inquiries/[id]/convert/route.ts`
- Create: `src/entities/inquiry/api/conversion-contracts.ts`
- Test: `tests/inquiry-conversion-api.test.ts`
- Test: `tests/automation-migration.test.ts` (extend static migration assertions)

**Interfaces:**
- `POST /api/admin/inquiries/:id/convert` accepts `{ customerName, customerMemo, projectName, contractAmount, expectedLaunchDate, projectMemo }`.
- RPC `convert_inquiry_to_project(p_inquiry_id uuid, p_customer_name text, p_customer_memo text, p_project_name text, p_contract_amount integer, p_expected_launch_date date, p_project_memo text)` returns inquiry/customer/project IDs and reuse flags.

- [ ] **Step 1: Write failing tests** for successful conversion, second call returning the same IDs without inserts, existing `inquiry_id` reuse, invalid payload/id, unauthenticated request, and migration SQL containing row lock, unique partial indexes, RPC, and rollback-safe update.
- [ ] **Step 2: Run focused tests and verify they fail because route/RPC contract is absent.**
- [ ] **Step 3: Add migration SQL:** partial unique indexes on non-null `customers.inquiry_id` and `projects.inquiry_id`; PL/pgSQL function locks the inquiry, validates existing converted IDs, reuses legacy inquiry links, inserts only missing rows, updates both converted IDs and status, and returns one row. Include comments with preflight/backfill SQL and explicit application order; do not execute it remotely.
- [ ] **Step 4: Implement route authentication, UUID/payload Zod validation, service-role client call to the RPC, and safe `INQUIRY_CONVERSION_*` error mapping.**
- [ ] **Step 5: Run focused tests and verify they pass.**
- [ ] **Step 6: Commit:** `git add supabase/migrations/202609050001_inquiry_conversion_integrity.sql src/app/api/admin/inquiries/[id]/convert/route.ts src/entities/inquiry/api/conversion-contracts.ts tests/inquiry-conversion-api.test.ts tests/automation-migration.test.ts && git commit -m "feat: add atomic inquiry conversion"`

### Task 5: Switch conversion UI to the atomic endpoint

**Files:**
- Modify: `src/features/convert-inquiry-to-project/ui/inquiry-conversion-panel.tsx`
- Modify: `src/features/convert-inquiry-to-project/model/conversion-payload.ts`
- Test: `tests/inquiry-conversion-payload.test.ts`

**Interfaces:**
- UI sends one request to `/api/admin/inquiries/${inquiry.id}/convert`; response supplies IDs and reuse flags.

- [ ] **Step 1: Add a failing payload test** for the single conversion request shape and response mapping.
- [ ] **Step 2: Run focused test and verify the current three-request flow does not satisfy it.**
- [ ] **Step 3: Replace list/create/PATCH sequence with one POST and preserve success/error UI state.**
- [ ] **Step 4: Run focused tests and verify they pass.**
- [ ] **Step 5: Commit:** `git add src/features/convert-inquiry-to-project/ui/inquiry-conversion-panel.tsx src/features/convert-inquiry-to-project/model/conversion-payload.ts tests/inquiry-conversion-payload.test.ts && git commit -m "feat: use atomic inquiry conversion API"`

### Task 6: Full verification, migration procedure, and PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-05-inquiry-conversion-search-design.md`
- Modify: `docs/superpowers/plans/2026-09-05-inquiry-conversion-search.md`
- Modify: `docs/roadmap.md` (only if issue status is tracked there)

- [ ] **Step 1: Run `npm run lint`.**
- [ ] **Step 2: Run `npm run type-check`.**
- [ ] **Step 3: Run `npm test` and record the exact passing count.**
- [ ] **Step 4: Run `PATH=/Users/youngjinson/.nvm/versions/node/v20.19.0/bin:$PATH npm run build -- --webpack`.**
- [ ] **Step 5: Run `git diff --check` and inspect `git status`; confirm no remote DB command was run.**
- [ ] **Step 6: Push branch and create a main-target PR with migration SQL, preflight/backfill/apply order, verification evidence, and explicit “not applied remotely” note.**
- [ ] **Step 7: Do not merge; request QA/Planner review.**
