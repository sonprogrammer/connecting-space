# 관리자 제안서·계약서 편집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트별 관리자 문서 화면에서 제안서·계약서 초안을 계약된 API로 생성·편집·저장·복사하고 과거 버전을 읽기 전용으로 확인한다.

**Architecture:** 기존 프로젝트 관리 화면은 진입 링크를 제공하고, `/admin/projects/[id]/documents` 전용 Client UI가 문서 query와 편집 상태를 담당한다. 문서 API key/query function은 문서 entity에 두고, 모든 조회는 no-store로 호출하며 mutation 후 같은 프로젝트/종류 query를 갱신한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query v5, Zod, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-26-admin-project-documents-design.md`

## Global Constraints

- 문서 타입은 `proposal | contract`, API는 `/api/admin/projects/{id}/documents`만 사용한다.
- GET에는 `cache: "no-store"`를 유지한다.
- POST generation은 UUID `requestKey`를 사용하고 진행 중인 같은 작업을 반복 POST하지 않는다.
- 재시도는 실패한 동일 키와 `retry: true`; 새 생성은 새 UUID 키를 사용한다.
- PATCH는 `expectedRevision`, `requestKey`, `title`, `summary`, `scopeItems`만 보낸다.
- review notice, confirmation questions, references는 서버가 소유하며 확정 상태로 표시하지 않는다.
- 응답에 없는 API 필드나 모델명, 생성된 운영 데이터를 만들지 않는다.
- 원격 DB 변경, 실제 AI 호출, 배포, PR 머지는 하지 않는다.

## Review Focus

- 진행 중 POST의 202 응답이나 화면 이탈 후 재진입은 중복 생성 POST 없이 GET으로 상태를 갱신한다. → Task 2 테스트.
- PATCH 중 refetch가 발생해도 dirty draft는 보존되고 409 후에도 입력이 남는다. → Task 3 테스트.
- version query는 편집기 내용으로 덮지 않고 읽기 전용 이력으로 표시한다. → Task 4 테스트.
- 인증/일반 API 오류의 안전한 안내와 cached data 재조회 실패 상태를 노출한다. → Task 2 테스트.
- 좁은 화면에서 검토 안내·폼·주요 동작·이력에 가로 overflow를 만들지 않는다. → Task 4 구조/클래스 테스트 및 PR 수동 확인.

---

## File Structure

- Create `src/entities/document/model/admin-document-queries.ts`: document query keys, API response types, no-store GET, generation/save request helpers.
- Export query model from `src/entities/document/index.ts` if it is a client-safe module.
- Create `src/widgets/admin-project-documents/ui/admin-project-documents.tsx`: per-project tabs, loading/error/empty/generating/editing/saving/conflict states, review panel, history, copy.
- Create `src/app/admin/projects/[id]/documents/page.tsx`: validate route param and render widget under existing AdminShell route group.
- Modify `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`: project detail link to the dedicated URL.
- Modify `src/widgets/admin-customer-projects/index.ts` only if reusing a public client entry is needed.
- Create `tests/admin-document-query.test.ts` and `tests/admin-project-documents-ui.test.ts` for API/query/state and screen behavior regressions.

## Task 1: Document query model and API contract tests

**Files:**
- Create `src/entities/document/model/admin-document-queries.ts`
- Modify `src/entities/document/index.ts`
- Create `tests/admin-document-query.test.ts`

**Interfaces:**
- Produces `adminProjectDocumentQueryKeys.detail(projectId, type, page = 1)` and `.version(projectId, type, version)`.
- Produces `fetchAdminProjectDocument(projectId, type, page = 1)` and `fetchAdminProjectDocumentVersion(projectId, type, version)`.
- Produces `generateAdminProjectDocument(projectId, { type, requestKey, retry? })` and `saveAdminProjectDocument(projectId, input)`.
- Query data mirrors existing response fields without inventing absent model or status values.

- [ ] **Step 1: Write failing tests** asserting query key separation by project/type/page/version; GET URL and `cache: "no-store"`; safe `AdminDocumentQueryError` handling for 401/403 and API errors; POST/PATCH method, body, and error parsing.
- [ ] **Step 2: Run `npx tsc -p tsconfig.test.json && node --test --test-name-pattern="admin document query" .test-dist/tests/admin-document-query.test.js`**; expected: TypeScript fails because the query module exports do not exist yet.
- [ ] **Step 3: Implement** the query model using the existing `parseAdminQueryResponse` semantics but document-specific safe messages; keep response fields API-shaped.
- [ ] **Step 4: Run `npx tsc -p tsconfig.test.json && node --test --test-name-pattern="admin document query" .test-dist/tests/admin-document-query.test.js`**; expected: all document query tests pass.
- [ ] **Step 5: Commit** Task 1 query model and tests with `git add src/entities/document/index.ts src/entities/document/model/admin-document-queries.ts tests/admin-document-query.test.ts docs/superpowers/specs/2026-10-26-admin-project-documents-design.md docs/superpowers/plans/2026-10-26-admin-project-documents.md && git commit -m "feat: add admin project document query model"`.

## Task 2: Generation and server state lifecycle

**Files:**
- Modify `src/widgets/admin-project-documents/ui/admin-project-documents.tsx`
- Create/modify `tests/admin-project-documents-ui.test.ts`

**Interfaces:** consumes Task 1 query keys/helpers. UI uses local state for the active generation request key, dirty editable narrative, and selected history version.

- [ ] **Step 1: Write failing tests** asserting empty state allows generation, 202 enters processing and polls/refetches GET without another POST, failed generation retries same key with `retry:true`, fresh generation uses a new key, and cached data remains visible with a safe warning after failed refetch.
- [ ] **Step 2: Run the focused UI test**; expected: named behavior assertions fail because the screen is absent.
- [ ] **Step 3: Implement** query-driven load/empty/processing/error states; use a moderate bounded read-only polling interval while status is processing and stop when no longer processing. Guard duplicate actions while pending.
- [ ] **Step 4: Run the focused UI test**; expected: all lifecycle assertions pass.
- [ ] **Step 5: Commit** the generation lifecycle and tests with message `feat: add project document generation states`.

## Task 3: Editor, save, draft safety, and copy

**Files:**
- Modify `src/widgets/admin-project-documents/ui/admin-project-documents.tsx`
- Modify `tests/admin-project-documents-ui.test.ts`

**Interfaces:** consumes the editor and mutation helpers from Task 2; PATCH input exactly matches the entity save schema.

- [ ] **Step 1: Add failing tests** for editing only title/summary/scopeItems; preserving dirty input across query refetch; preserving input on 409 revision conflict; success invalidating the current document query and displaying the saved revision; copy including review-only notice and excluding an assertion that references are confirmed.
- [ ] **Step 2: Run focused tests**; expected: each new behavior assertion fails before implementation.
- [ ] **Step 3: Implement** controlled editable fields initialized once per document revision, save mutation with UUID and current expected revision, conflict-safe draft retention, and copy from visible narrative plus review notice.
- [ ] **Step 4: Run focused tests**; expected: all editor/save/copy regressions pass.
- [ ] **Step 5: Commit** editor/save/copy changes and tests with message `feat: add project document editing and save`.

## Task 4: Version history, route, project entry, responsive and accessible UI

**Files:**
- Create `src/app/admin/projects/[id]/documents/page.tsx`
- Create/modify `src/widgets/admin-project-documents/ui/admin-project-documents.tsx`
- Create `src/widgets/admin-project-documents/index.ts`
- Modify `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`
- Modify `tests/admin-project-documents-ui.test.ts`

**Interfaces:** consumes Tasks 1–3. Version selection uses `fetchAdminProjectDocumentVersion` and never modifies the current editor state.

- [ ] **Step 1: Add failing tests** for project detail navigation href; version query/read-only labeling without changing dirty editor; accessible labels/status/error role; responsive single-column and desktop two-column classes; invalid project UUID safe route behavior.
- [ ] **Step 2: Run focused tests**; expected: route/navigation/layout assertions fail before implementation.
- [ ] **Step 3: Implement** dynamic route with Next 16 Promise params and `z.uuid()` validation; render one-column mobile/tablet and two-column desktop editor/history; provide semantic tabs, field labels, focus styles, status text, and read-only older versions.
- [ ] **Step 4: Run focused tests**; expected: all history/route/accessibility/layout assertions pass.
- [ ] **Step 5: Commit** route/navigation/history changes and tests with message `feat: add project document editor route`.

## Task 5: Verification and PR handoff

**Files:** all Task 1–4 changes.

- [ ] Run `npm test` and record pass/fail/skip counts.
- [ ] Run `npm run lint`.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run build -- --webpack` with Node 22.23.3.
- [ ] Run `git diff --check origin/main...HEAD`.
- [ ] Manually inspect 360px, 768px, and 1280px layouts if authenticated app access is available; record what was actually verified and any blockers.
- [ ] Obtain one fresh whole-branch review, resolve any Important/Critical findings with TDD, then open a separate PR with actual command results and manual responsive checks. Do not merge, deploy, or modify remote DB.
