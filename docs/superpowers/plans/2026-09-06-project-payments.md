# Project Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트별 결제 예정, 실제 입금, 매출 및 미수금 관리자 API를 제공한다.

**Architecture:** 기존 `payments`를 예정 항목으로 유지하고 `payment_receipts`를 후속 migration으로 추가한다. 계산은 독립적인 순수 함수에 두고 Next.js Route Handler는 관리자 사용자 Supabase client로 CRUD와 조회를 수행한다.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Zod, Supabase/PostgreSQL, Node test runner

**Spec:** `docs/superpowers/specs/2026-09-06-project-payments-design.md`

## Global Constraints

- 금액은 정수이며 생성 금액은 1 이상이다.
- 원격 Supabase에는 migration을 적용하지 않는다.
- API는 검증된 관리자 사용자 client만 사용한다.
- reset/delete와 운영 테스트 데이터 생성은 수행하지 않는다.

---

### Task 1: 결제 계약과 계산 모델

**Files:**
- Create: `src/entities/payment/model/types.ts`
- Create: `src/entities/payment/model/summary.ts`
- Create: `src/entities/payment/schemas/payment.schema.ts`
- Create: `src/entities/payment/api/contracts.ts`
- Create: `src/entities/payment/index.ts`
- Test: `tests/payment-summary.test.ts`
- Test: `tests/payment-schema.test.ts`

**Interfaces:**
- Produces: `calculateProjectPaymentSummary(projectContractAmount, payments, receipts)`와 create/update/receipt Zod schemas

- [ ] **Step 1: Write failing calculation and validation tests**
- [ ] **Step 2: Run focused tests and confirm expected failures**
- [ ] **Step 3: Implement payment types, schemas, and calculation function**
- [ ] **Step 4: Run focused tests and confirm pass**
- [ ] **Step 5: Commit the model**

### Task 2: 후속 DB migration

**Files:**
- Create: `supabase/migrations/202609060001_project_payment_receipts.sql`
- Modify: `src/shared/types/database.generated.ts`
- Test: `tests/payment-migration.test.ts`

**Interfaces:**
- Produces: `public.payment_receipts` with unique `(payment_id, idempotency_key)`, admin-only RLS, timestamps, indexes

- [ ] **Step 1: Write failing migration contract tests**
- [ ] **Step 2: Run focused test and confirm missing migration failure**
- [ ] **Step 3: Add migration and generated database type**
- [ ] **Step 4: Run focused test and confirm pass**
- [ ] **Step 5: Commit the migration**

### Task 3: 관리자 결제·입금 API

**Files:**
- Create: `src/app/api/admin/projects/[id]/payments/route.ts`
- Create: `src/app/api/admin/payments/[id]/route.ts`
- Create: `src/app/api/admin/payments/[id]/receipts/route.ts`
- Create: `src/app/api/admin/payment-receipts/[id]/route.ts`
- Test: `tests/payment-api.test.ts`

**Interfaces:**
- Consumes: payment schemas, contracts, calculation function, `getVerifiedAdminSupabase`
- Produces: authenticated project payment summary and payment/receipt CRUD endpoints

- [ ] **Step 1: Write failing auth, validation, CRUD, duplicate, not-found, and error tests**
- [ ] **Step 2: Run focused API tests and confirm route-module failures**
- [ ] **Step 3: Implement minimal Route Handlers**
- [ ] **Step 4: Run focused tests and confirm pass**
- [ ] **Step 5: Commit the APIs**

### Task 4: 실제 PostgreSQL 및 전체 검증

**Files:**
- Create: `tests/payment-rls.integration.test.ts`

**Interfaces:**
- Consumes: local Supabase admin/anon credentials
- Produces: executable RLS and duplicate idempotency regression test

- [ ] **Step 1: Add opt-in local PostgreSQL integration test**
- [ ] **Step 2: Apply migrations and run it against local Supabase**
- [ ] **Step 3: Run lint, type-check, full tests, production build, and diff check**
- [ ] **Step 4: Commit, push, open PR, and record PR/QA steps in issue #35**
