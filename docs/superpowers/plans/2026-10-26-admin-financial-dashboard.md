# Admin Financial Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/admin` with trustworthy project financial summaries and compact recent inquiry/project previews while keeping the existing Today To Do queue primary.

**Architecture:** Add a status-keyed React Query adapter for the merged aggregate endpoint, extend the existing project-list request contract for date ordering, and compose focused dashboard panels around the existing work-items UI. Reuse the shared inquiry list query and invalidate every financial-summary status key after project/payment mutations.

**Tech Stack:** Next.js 16.2.11, React 19, TanStack Query 5, TypeScript, Zod, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-admin-financial-dashboard-design.md`

## Global Constraints

- Use Node `22.23.3` from `.nvmrc`.
- Keep `GET /api/admin/financial-summary?status=<status>` and its existing response fields; do not calculate or fabricate amounts in the browser.
- Keep authenticated fetches at `cache: "no-store"`; React Query keys must include every response-changing status/sort/page input.
- Keep Today To Do as the primary dashboard workflow; do not add charts or an invented near-deadline cutoff.
- Do not change Backend/API, migrations, remote DB, deployment, or merge the PR.
- Before editing UI code, read the relevant installed Next.js 16.2.11 guide under `node_modules/next/dist/docs/`.
- Verify with `npm test`, `npm run lint`, `npm run type-check`, `npm run build -- --webpack`, and `git diff --check origin/main...HEAD`.

## Review Focus

- Changing the financial scope from `active` to a single status or `all` must show that exact response and never reuse another status key. Test distinct query keys and URL values.
- A successful empty financial response (`projectCount: 0`) must show explicit empty-scope wording and the API's zero totals, not loading or fabricated data. Test the empty-state selector/helper.
- A cached financial response followed by a non-auth refetch failure must remain visible with a warning and retry action; 401/403 must use the existing admin login redirect. Test cached-state selection and status preservation.
- Missing project launch dates must not be presented as a deadline or sorted client-side against the server order. Test the preview's API sort parameters and null-date rendering.
- Payment receipt/payment changes, project edits, and inquiry-to-project conversion must invalidate every affected financial summary scope. Test invalidation of active, individual, and all-status keys.

---

## Preflight (before Task 1)

- Run `nvm use` and confirm `node -v` is `v22.23.3`.
- Run `npm ci`, then `npm test` once as the clean baseline. If the baseline fails, stop and report before feature changes.
- Read the relevant Next.js 16.2.11 guide in `node_modules/next/dist/docs/` before changing the dashboard UI.

### Task 1: Financial summary query model

**Files:**
- Create: `src/entities/payment/model/admin-financial-summary-queries.ts`
- Modify: `src/entities/payment/index.ts`
- Test: `tests/admin-financial-summary-query.test.ts`

**Interfaces:**
- Produces `adminFinancialSummaryQueryKeys.all`, `adminFinancialSummaryQueryKeys.byStatus(status)`, `fetchAdminFinancialSummary(status, fetcher?, signal?)`, and `adminFinancialSummaryQueryOptions(status, fetcher?)` for later UI and mutation tasks.
- `status` uses the existing `financialSummaryQuerySchema` inferred type; the response uses `AdminFinancialSummaryResponse`.

- [x] **Step 1: Write failing tests** named `financial summary keys vary by status`, `financial summary fetch validates the API envelope and uses no-store`, and `financial summary fetch preserves 401 and 403 status`.
- [x] **Step 2: Run targeted test and verify RED.** Run `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-financial-summary-query.test.js`; expected failure is a compile error for the missing query API.
- [x] **Step 3: Implement the query key, fetcher, and query options** using the existing API envelope and response schema; do not transform financial fields.
- [x] **Step 4: Run the targeted test and verify GREEN.** Run `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-financial-summary-query.test.js`.
- [x] **Step 5: Commit** `feat(admin): add financial summary query model`.

### Task 2: Project list sort inputs

**Files:**
- Modify: `src/widgets/admin-customer-projects/model/admin-customer-project-queries.ts`
- Test: `tests/admin-customer-project-query.test.ts`

**Interfaces:**
- Define `ProjectListQuerySettings = { pageSize?: number; sort?: "created_at" | "name" | "status" | "expected_launch_date"; direction?: "asc" | "desc" }`.
- Preserve `fetchProjectList(page: number, query: string, status: ProjectStatus | "", settings?: ProjectListQuerySettings)` call sites with defaults (`pageSize: 20`, `sort: "created_at"`, `direction: "desc"`).
- Update `customerProjectQueryKeys.projects.list(page, query, status, settings?)` to include normalized `pageSize`, `sort`, and `direction` values.

- [x] **Step 1: Write failing tests** named `project list keys include sort direction and page size` and `project list sends the requested launch-date order`.
- [x] **Step 2: Run the targeted test and verify RED.** Run `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js`.
- [x] **Step 3: Extend the project list helper and key factory** with typed optional settings while preserving current defaults and existing consumers.
- [x] **Step 4: Run the targeted test and verify GREEN** with the same command.
- [x] **Step 5: Commit** `feat(admin): support project launch-date query`.

### Task 3: Inquiry and project preview panels

**Files:**
- Create: `src/widgets/admin-dashboard/model/admin-dashboard-preview-queries.ts`
- Create: `src/widgets/admin-dashboard/ui/admin-dashboard-preview-panels.tsx`
- Modify: `src/widgets/admin-dashboard/ui/admin-route-overview.tsx`
- Test: `tests/admin-dashboard-preview-panels.test.ts`

**Interfaces:**
- Produce `adminDashboardInquiryQueryOptions` with the exact shared `adminInquiryQueryKeys.list()` key and `fetchAdminInquiryList` function, plus `getRecentInquiryPreview(items: readonly AdminInquiryListItem[]): AdminInquiryListItem[]` returning the first five API-ordered inquiries.
- Produce `adminUpcomingProjectQueryOptions` using `customerProjectQueryKeys.projects.list(1, "", "in_progress", { pageSize: 20, sort: "expected_launch_date", direction: "asc" })` and `fetchProjectList` with the same arguments; `getUpcomingProjectPreview(items: readonly AdminProjectListItem[]): AdminProjectListItem[]` returns the first five items without client sorting.
- Produce `getProjectLaunchDateLabel(date: string | null): string`, returning the displayed date or `예정일 미정` when absent.
- Inquiry rows link to `/admin/inquiries#inquiry-{id}`; project rows link to `/admin/projects?project={id}` and open the selected detail, while the panel links to `/admin/projects`.

- [x] **Step 1: Write failing tests** named `dashboard inquiry preview shares the common list query`, `inquiry preview keeps only the first five API-ordered records`, `upcoming project preview requests in-progress launch-date ascending`, and `project preview keeps server order and labels missing dates`.
- [x] **Step 2: Run the targeted test and verify RED.** Run `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-dashboard-preview-panels.test.js`.
- [x] **Step 3: Implement the two compact panels** with independent loading, empty, cached-refetch warning, retry, and 401/403 redirect states; keep the project label `예정 출시일순` rather than claiming an undefined deadline window.
- [x] **Step 4: Add the panels below the existing Today To Do queue** and run the targeted test to verify GREEN.
- [x] **Step 5: Commit** `feat(admin): add dashboard inquiry and project previews`.

### Task 4: Financial summary panel and dashboard composition

**Files:**
- Create: `src/widgets/admin-dashboard/ui/admin-financial-summary-panel.tsx`
- Modify: `src/widgets/admin-dashboard/ui/admin-route-overview.tsx`
- Test: `tests/admin-financial-summary-panel.test.ts`

**Interfaces:**
- Panel consumes `adminFinancialSummaryQueryOptions(status)` from Task 1 and displays the server fields `expectedRevenue`, `confirmedRevenue`, `receivedTotal`, `outstanding`, `projectCount`, `includedStatuses`, and `asOf`.
- Scope selector offers `active` (visible label `진행 범위`, with its included statuses shown), all six individual project statuses, and `all`.

- [x] **Step 1: Write failing tests** named `summary scope defaults to active and maps selected status to its query`, `empty summary displays server zeros with an explicit no-project message`, `cached summary remains visible with a retry warning after refetch error`, and `401 and 403 summary errors request the existing login redirect`.
- [x] **Step 2: Run the targeted test and verify RED.** Run `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-financial-summary-panel.test.js`.
- [x] **Step 3: Implement the accessible summary panel** with status text, four server-value cards, `projectCount`, Seoul-localized `asOf`, project-management link, loading/error/empty states, and retry; reuse the existing payment amount formatter.
- [x] **Step 4: Insert the panel below the existing action-count cards and before the work-item list**; run the targeted test to verify GREEN.
- [x] **Step 5: Commit** `feat(admin): show financial summary on dashboard`.

### Task 5: Financial summary cache invalidation

**Files:**
- Modify: `src/entities/payment/model/admin-financial-summary-queries.ts`
- Modify: `src/widgets/admin-customer-projects/ui/project-payment-manager.tsx`
- Modify: `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`
- Modify: `src/features/convert-inquiry-to-project/ui/inquiry-conversion-panel.tsx`
- Test: `tests/admin-financial-summary-query.test.ts`

**Interfaces:**
- Add `invalidateAdminFinancialSummaryQueries(queryClient)` to invalidate the `adminFinancialSummaryQueryKeys.all` prefix.
- Invoke it only after successful payment/receipt mutation, project save, and inquiry-to-project conversion.

- [x] **Step 1: Write a failing cache test** that seeds `active`, an individual-status, and `all` summary queries and verifies one invalidation helper marks every scope stale.
- [x] **Step 2: Run the targeted query test and verify RED.** Run `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-financial-summary-query.test.js`.
- [x] **Step 3: Implement the prefix invalidation helper** and call it from the three successful mutation paths without changing their existing invalidations or error behavior.
- [x] **Step 4: Run the targeted test and verify GREEN**, then run the related payment, project, and inquiry conversion tests.
- [x] **Step 5: Commit** `fix(admin): invalidate dashboard summary after data changes`.

### Task 6: Full verification and PR handoff

**Files:**
- No additional production files; PR description records exact scope, checks, and manual visual coverage.

- [x] Read the relevant installed Next.js documentation before UI code changes if not already done.
- [x] Run `npm test`, `npm run lint`, `npm run type-check`, `npm run build -- --webpack`, and `git diff --check origin/main...HEAD`; record actual pass/fail/skip results.
- [x] Inspect the final diff and verify 360px, 768px, and 1280px layout behavior in Browser if available; otherwise list those exact manual checks as unverified in the PR.
- [ ] Create a separate PR linked with `Closes #37`, document the un-applied production migration as out of frontend scope, and request independent frontend QA on the full HEAD SHA. Do not merge, deploy, or modify remote DB.

## Coverage Self-Review

- Financial endpoint fields, status scope, error contract, no-store, loading, empty, stale-cache warning, and auth expiry: Tasks 1 and 4.
- Today To Do priority and query flow remains intact: Tasks 3 and 4.
- Recent inquiries reuse the shared query: Task 3.
- Project list ordering and missing deadlines: Tasks 2 and 3.
- Financial cache consistency after every relevant mutation: Task 5.
- Responsive/accessibility review and exact verification/PR handoff: Task 6.
