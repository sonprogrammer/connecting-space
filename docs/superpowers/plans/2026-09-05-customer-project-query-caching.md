# 고객·프로젝트 관리 조회 캐싱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 고객·프로젝트 목록·상세 조회를 TanStack Query 기반 클라이언트 캐시로 전환해 반복 탐색을 즉시 표시하고 백그라운드 재검증한다.

**Architecture:** 관리자 layout 아래에만 `QueryClientProvider`를 제공한다. 고객·프로젝트·문의 query key와 API fetcher를 모델 파일로 분리하고, 관리 위젯은 `useQuery`/`useMutation`으로 목록·상세·연결 이동·저장을 관리한다. API route와 데이터 계층은 변경하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query 5, TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-customer-project-query-caching-design.md`

## Global Constraints

- 관리자 영역에만 `QueryClientProvider`를 적용한다.
- `staleTime`은 `30_000`, `gcTime`은 `300_000`으로 설정한다.
- API, 원격 DB, migration, 공개 페이지 캐싱 정책은 변경하지 않는다.
- 기존 인증 만료·404·네트워크 오류·연결 이동 동작을 유지한다.
- 구현 중에는 관련 테스트, lint, type-check만 실행한다.
- 최종 push 직전에 전체 테스트와 `npm run build -- --webpack`을 각각 실행한다.

---

### Task 1: QueryClient 제공과 query 모델 구축

**Files:**
- Create: `src/app/admin/admin-query-provider.tsx`
- Modify: `src/app/admin/layout.tsx`
- Create: `src/widgets/admin-customer-projects/model/admin-customer-project-queries.ts`
- Test: `tests/admin-customer-project-query.test.ts`

**Interfaces:**
- Produces `customerProjectQueryKeys`, `fetchCustomerList`, `fetchProjectList`, `fetchCustomerDetail`, `fetchProjectDetail`, `fetchInquiryDetail`, `AdminQueryError`.

- [ ] **Step 1: Write failing query key and response error tests**

```ts
test("keeps customer/project list keys separate for every filter", () => {
  assert.notDeepEqual(customerProjectQueryKeys.customers.list(1, "acme"), customerProjectQueryKeys.customers.list(2, "acme"));
  assert.notDeepEqual(customerProjectQueryKeys.projects.list(1, "", "planning"), customerProjectQueryKeys.projects.list(1, "", "completed"));
});

test("turns an API failure into an error with status and auth flag", async () => {
  await assert.rejects(() => parseAdminQueryResponse(new Response(JSON.stringify({ error: { code: "ADMIN_AUTH_REQUIRED", message: "expired" } }), { status: 401 })), (error: AdminQueryError) => error.status === 401 && error.isAuthExpired);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js`
Expected: FAIL because query key and response parser are not defined.

- [ ] **Step 3: Implement provider, keys, fetchers, and parser**

Use `new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 300_000 } } })` in a Client provider. Build list URLs with every pagination/search/filter value and throw `AdminQueryError` for non-2xx or `{ error }` API responses.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/widgets/admin-customer-projects/model/admin-customer-project-queries.ts tests/admin-customer-project-query.test.ts
git commit -m "feat: add admin query cache infrastructure"
```

### Task 2: Convert customer/project manager reads to cached queries

**Files:**
- Modify: `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`
- Modify: `src/widgets/admin-customer-projects/model/admin-customer-project-state.ts`
- Test: `tests/admin-customer-project-query.test.ts`

**Interfaces:**
- Consumes Task 1 query keys/fetchers and `AdminQueryError`.
- Produces cached list/detail state with `isFetching` background indicators and `keepPreviousData` pagination behavior.

- [ ] **Step 1: Add failing cache behavior tests**

```ts
test("updates a cached detail without clearing it while refetching", () => {
  const client = new QueryClient();
  const key = customerProjectQueryKeys.customers.detail("customer-1");
  client.setQueryData(key, { id: "customer-1", name: "기존 고객" });
  client.setQueryData(key, { id: "customer-1", name: "수정 고객" });
  assert.equal(client.getQueryData<{ name: string }>(key)?.name, "수정 고객");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js`
Expected: FAIL until the manager cache helpers and query keys are available.

- [ ] **Step 3: Replace manual list/detail effects with `useQuery`**

Use list keys containing page/query/status and `placeholderData: keepPreviousData`. Render cached data whenever `data` exists; show a small fetching indicator instead of replacing the panel with a full loading state. Use detail queries for selected customer/project and inquiry conversion lookup.

- [ ] **Step 4: Run focused tests, lint, and type-check**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js && npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/admin-customer-projects
git commit -m "feat: cache customer and project reads"
```

### Task 3: Add mutation cache updates and explicit refresh

**Files:**
- Modify: `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`
- Modify: `tests/admin-customer-project-query.test.ts`

**Interfaces:**
- Consumes detail/list query keys from Task 1.
- Produces PATCH mutations that call `setQueryData` for the detail response and invalidate only the corresponding list family.

- [ ] **Step 1: Add failing mutation invalidation tests**

```ts
test("invalidates only the changed entity list family after save", async () => {
  const client = new QueryClient();
  client.setQueryData(customerProjectQueryKeys.customers.list(1, ""), { items: [] });
  client.setQueryData(customerProjectQueryKeys.projects.list(1, "", ""), { items: [] });
  const customerKey = customerProjectQueryKeys.customers.detail("customer-1");
  client.setQueryData(customerKey, { id: "customer-1", name: "기존 고객" });
  client.setQueryData(customerKey, { id: "customer-1", name: "저장 고객" });
  assert.equal(client.getQueryData<{ name: string }>(customerKey)?.name, "저장 고객");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js`
Expected: FAIL until mutation cache helpers are implemented.

- [ ] **Step 3: Implement mutations and refresh handlers**

On successful PATCH, update the selected detail query with the response and invalidate the corresponding list query family. Wire the refresh button to `refetch` the active list and selected detail query; preserve cached data during the request.

- [ ] **Step 4: Run focused tests, lint, and type-check**

Run: `npx tsc -p tsconfig.test.json && node --test .test-dist/tests/admin-customer-project-query.test.js && npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx tests/admin-customer-project-query.test.ts
git commit -m "feat: update admin query cache after saves"
```

### Task 4: Full verification and PR

**Files:**
- No source changes expected; inspect `git diff` and `git status`.

- [ ] **Step 1: Run final lint and type-check**

Run: `npm run lint && npm run type-check`
Expected: PASS.

- [ ] **Step 2: Run the full test suite once before push**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Run webpack production build once before push**

Run: `PATH=/Users/youngjinson/.nvm/versions/node/v20.19.0/bin:$PATH npm run build -- --webpack`
Expected: successful Next.js production build.

- [ ] **Step 4: Push a dedicated branch and create a PR**

```bash
git switch -c frontend/issue-53-query-caching
git push -u origin frontend/issue-53-query-caching
gh pr create --base main --head frontend/issue-53-query-caching --title "feat: cache admin customer and project queries" --body-file /private/tmp/imweb-issue53-pr-body.md
```

The PR body must document cache behavior, tests, and that API/DB/migration were untouched. Do not merge the PR.
