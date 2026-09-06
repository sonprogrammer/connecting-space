# Project Payment Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 상세에 결제 예정·실제 입금·미수금 관리 UI를 추가한다.

**Architecture:** 기존 결제 API를 감싼 프론트 query/fetcher 모델을 만들고, 프로젝트 상세에 독립적인 `ProjectPaymentManager`를 배치한다. TanStack Query가 서버 계산 요약을 캐시하며 mutation 성공 후 프로젝트 결제 query만 invalidate한다.

**Tech Stack:** Next.js 16, React, TypeScript, TanStack Query, Zod, Node test runner, Tailwind UI primitives

**Spec:** `docs/superpowers/specs/2026-09-06-project-payment-management-ui-design.md`

## Global Constraints

- API·원격 DB·migration은 변경하지 않는다.
- 결제 금액은 양의 정수만 전송한다.
- 401/403 및 API 오류를 안전한 사용자 메시지로 표시한다.
- 최종 검증은 lint, type-check, 전체 테스트, webpack production build, diff check를 수행한다.

---

### Task 1: Payment query/fetcher model

**Files:**
- Create: `src/widgets/admin-customer-projects/model/admin-project-payment-queries.ts`
- Test: `tests/admin-project-payment-query.test.ts`

**Interfaces:**
- Produces `adminProjectPaymentQueryKeys.detail(projectId)`, `fetchProjectPayments`, `createPayment`, `updatePayment`, `deletePayment`, `createPaymentReceipt`, `deletePaymentReceipt`.
- All fetchers parse `ApiResponse<AdminProjectPaymentsResponse>` and throw an error carrying status/auth-expired information.

- [ ] Add failing tests for query keys, response parsing, auth errors, request payloads, and idempotency key generation.
- [ ] Implement fetchers with existing `fetch`/`ApiResponse` conventions and no server-side changes.
- [ ] Run focused query tests and type-check.

### Task 2: Payment UI model and forms

**Files:**
- Create: `src/widgets/admin-customer-projects/model/admin-project-payment-state.ts`
- Test: `tests/admin-project-payment-state.test.ts`

**Interfaces:**
- Produces labels for payment kind/status, integer amount parsing, date formatting, and safe API error mapping.

- [ ] Add failing tests for kind/status labels, positive integer validation, blank optional fields, and 401/403/validation messages.
- [ ] Implement pure helpers and form defaults without changing API contracts.
- [ ] Run focused state tests.

### Task 3: Project payment manager UI

**Files:**
- Create: `src/widgets/admin-customer-projects/ui/project-payment-manager.tsx`
- Modify: `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`
- Test: `tests/admin-project-payment-ui.test.ts`

**Interfaces:**
- `ProjectPaymentManager({ projectId }: { projectId: string })` renders summary, scheduled payments, receipts, forms, loading/empty/error/saving/success states.

- [ ] Add source/UI regression tests for summary labels, payment/receipt actions, accessible error states, and cache invalidation wiring.
- [ ] Implement query loading/error/empty states and responsive payment summary/list layout.
- [ ] Implement create/edit/delete payment and create/delete receipt flows with disabled controls while saving.
- [ ] Mount the manager below `ProjectEditor` only when a project detail is selected.
- [ ] Run focused UI tests, lint, and type-check.

### Task 4: Final verification and PR handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-09-06-project-payment-management-ui.md` only if execution notes are needed.

- [ ] Run `git diff --check`.
- [ ] Run `npm run lint` and `npm run type-check`.
- [ ] Run full `npm test` once and record the count.
- [ ] Run `PATH=/Users/youngjinson/.nvm/versions/node/v20.19.0/bin:$PATH npm run build -- --webpack` once.
- [ ] Commit frontend-only changes and push a new branch targeting `main`.
- [ ] Open a separate PR and add QA verification steps: select a project, create/edit/delete scheduled payment, add/delete receipt, verify partial payment/outstanding balance, test invalid amount and expired auth, and confirm mobile keyboard access.
