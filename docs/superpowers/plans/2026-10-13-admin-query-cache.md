# 관리자 조회 캐시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 메뉴 전환에서 30초 내 성공한 조회 캐시를 재사용하고, 오늘 할 일 업무함의 모든 추가 페이지를 동일 `asOf` 기준으로 정확히 이어 붙인다.

**Architecture:** 기존 공용 QueryClient의 stale/gc 설정을 사용한다. 업무함은 그룹·정렬이 분리된 `useInfiniteQuery`로 전환하고, 직접 fetch하던 나머지 관리자 조회는 도메인별 query key/fetcher와 `useQuery`로 옮긴다. 성공한 데이터 변경은 공용 query key prefix를 통해 관련 캐시를 무효화하며, 업무함 스냅샷이 낡지 않도록 페이지 체인을 초기 페이지부터 다시 조회한다.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TanStack React Query 5.101.4, TypeScript, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-13-admin-query-cache-design.md`

## 전역 제약

- 공용 관리자 QueryClient의 `staleTime: 30_000`, `gcTime: 300_000`을 유지한다.
- 관리자 조회 fetch에는 `cache: "no-store"`를 유지한다.
- 업무함 그룹/정렬은 query key를 분리하고, 변경 시 첫 페이지부터 조회한다.
- 업무함 다음 페이지는 첫 페이지 응답의 `asOf`를 그대로 사용하고 서버 정렬 순서를 유지한다.
- 업무 우선순위 및 페이지 데이터는 클라이언트에서 재정렬하지 않는다.
- 전체 그룹은 `pagination.total`, 그룹 필터는 현재 그룹 응답의 `pagination.total`, 불러온 건수는 페이지 item 수 합계를 사용한다.
- API 계약·서버·DB·migration·배포·머지는 변경하지 않는다.
- 기존 dirty/untracked 파일을 보존한다.

## 검토 중점

- 페이지 추가 중 첫 페이지 캐시가 갱신되어 `asOf`가 섞임: mutation 이후 업무함 페이지 체인을 초기화해 새 스냅샷에서 시작하는 테스트를 추가한다.
- 필터 그룹의 전체 건수와 대시보드 전체 count를 혼동함: 선택 그룹 `pagination.total`을 사용하는 UI/model 테스트를 추가한다.
- 페이지 결과가 중복되거나 빠짐: 25건을 초과하는 다중 페이지 테스트에서 정확한 ID 순서·집합·중복 없음 검증을 추가한다.
- 새 query key만 고치고 조회 fetcher가 브라우저 HTTP 캐시를 사용함: 모든 신규/이동 fetcher에서 `cache: "no-store"` 검증을 추가한다.
- 관리 mutation 중 일부가 업무함 캐시를 갱신하지 않음: 문의·전환·견적·결제·고객/프로젝트 변경 성공 경로의 무효화를 테스트한다.

---

### Task 1: 업무함 무한 query와 페이지 건수

**파일:**
- 수정: `src/widgets/admin-dashboard/model/admin-today-dashboard.ts`
- 수정: `src/widgets/admin-dashboard/ui/admin-route-overview.tsx`
- 수정: `tests/admin-today-dashboard.test.ts`

**인터페이스:**
- 제공: `adminWorkItemsQueryKeys.all`과 `adminWorkItemsQueryKeys.list({ group, sort, pageSize })`.
- 제공: 업무함 infinite query options. 초기 pageParam은 `{ page: 1 }`; 후속 pageParam은 `{ page: number; asOf: string }`.
- 소비: 기존 `fetchAdminWorkItems({ group, sort, page, pageSize, asOf }, fetcher, signal)`과 API `AdminWorkItemsResponse` 계약.

- [ ] **1단계: RED 테스트 작성**

`tests/admin-today-dashboard.test.ts`에 다음을 추가한다.

- group, sort, pageSize별 key 차이와 같은 인수 key의 안정성을 검사한다.
- 동일 QueryClient에서 업무함 A 조회 → B 조회 → 30초 이내 A 조회를 수행하고 각 API fetch 횟수가 A 1회, B 1회인지 검사한다.
- `fetchInfiniteQuery`에 51개 업무의 두 페이지 응답을 공급한다. 두 번째 요청에 page 2와 첫 응답 `asOf`가 전달되고, 총 로드 ID가 기대된 51개와 정확히 일치하며 중복 ID가 없고 순서가 보존되는지 검사한다.
- 그룹 필터 응답에서 `counts.total`과 다른 `pagination.total`을 반환해 UI용 전체 건수가 `pagination.total`에서 오고, loaded count는 누적 item 수에서 오는지 검사한다.
- 마지막 응답의 `hasNextPage: false`일 때 추가 fetch가 없음을 검사한다.

- [ ] **2단계: RED 확인**

실행: `npm test -- --test-name-pattern='admin work items query cache'` (해당 스크립트에서 이름 필터가 동작하지 않으면 `npm test`로 확인)

예상: 새 query key/options 또는 loaded-count helper 부재로 실패한다.

- [ ] **3단계: 최소 구현**

`admin-today-dashboard.ts`에 key factory, infinite query options/get-next-page-param, 누적 loaded-count helper를 정의한다. `admin-route-overview.tsx`는 로컬 fetch/AbortController 상태를 `useInfiniteQuery`로 바꾸고 기존 loading/error/empty/refetch UI를 보존한다. “전체 N건 · 불러온 M건”을 표시하며 현재 그룹이면 응답 `pagination.total`을 쓴다.

초기 요청은 page 1에 `asOf`를 생략하고, 이후 요청은 첫 페이지의 `asOf`와 마지막 page + 1을 fetcher에 전달한다. 기존 `cache: "no-store"` fetcher를 재사용한다. 그룹/정렬 query key 변경으로 page 1부터 시작한다.

- [ ] **4단계: GREEN 확인**

실행: `npm test -- --test-name-pattern='admin work items query cache'`

예상: 캐시 재사용, snapshot 유지, 순서/중복/누락, count assertions 통과.

- [ ] **5단계: 커밋**

```bash
git add src/widgets/admin-dashboard/model/admin-today-dashboard.ts src/widgets/admin-dashboard/ui/admin-route-overview.tsx tests/admin-today-dashboard.test.ts
git commit -m "feat: cache admin work item pages"
```

### Task 2: 대시보드 레거시 문의 query

**파일:**
- 생성: `src/widgets/admin-dashboard/model/admin-inquiry-queries.ts`
- 수정: `src/widgets/admin-dashboard/ui/admin-inquiry-list.tsx`
- 수정: `tests/admin-inquiry-list-format.test.ts` 또는 신규 `tests/admin-inquiry-query.test.ts`

**인터페이스:**
- 제공: `adminInquiryQueryKeys.list`, `.detail(id)` 및 no-store fetchers.
- 소비: 작업 1의 업무함 key factory; 문의 변경 성공 후 업무함과 문의 목록/상세 query를 무효화한다.

- [ ] **1단계: RED 테스트 작성**

목록/상세 key가 서로 분리되고 문의 ID별 상세 key가 다름, fetcher가 `cache: "no-store"`와 기존 API shape/401·403 처리를 지킴, A→B→A 30초 캐시 재사용을 테스트한다. 선택 문의가 목록 결과에 없을 때 기존 선택 해제/기본 선택 동작을 보존하는 UI 모델 assertion도 추가한다.

- [ ] **2단계: RED 확인**

실행: `npm test -- --test-name-pattern='admin inquiry query'`

예상: 새 key/fetcher가 없어 실패한다.

- [ ] **3단계: 최소 구현**

신규 model에 응답 타입을 명시한 목록/상세 query 함수를 만들고 `cache: "no-store"`를 유지한다. `AdminInquiryList`는 목록 및 선택 상세의 로컬 fetch 상태를 `useQuery`로 대체하고 캐시 데이터가 있는 백그라운드 갱신 중 기존 데이터를 유지한다. 기존 hash deep-link와 인증 redirect를 보존한다. 문의 PATCH 성공 시 query cache의 상세를 갱신하고 문의 목록/업무함 query를 무효화한다.

- [ ] **4단계: GREEN 확인**

실행: `npm test -- --test-name-pattern='admin inquiry query'`

예상: API, 캐시, 선택 상태, auth assertions 통과.

- [ ] **5단계: 커밋**

```bash
git add src/widgets/admin-dashboard/model/admin-inquiry-queries.ts src/widgets/admin-dashboard/ui/admin-inquiry-list.tsx tests/admin-inquiry-query.test.ts
git commit -m "feat: cache admin inquiry reads"
```

### Task 3: 포트폴리오·서비스·FAQ 조회 query화

**파일:**
- 생성: `src/widgets/admin-portfolio/model/admin-portfolio-queries.ts`
- 수정: `src/widgets/admin-portfolio/ui/admin-portfolio-manager.tsx`
- 생성: `src/widgets/admin-automation-content/model/admin-automation-content-queries.ts`
- 수정: `src/widgets/admin-automation-content/ui/admin-automation-content-manager.tsx`
- 생성/수정 테스트: `tests/admin-portfolio-query.test.ts`, `tests/admin-automation-content-query.test.ts`

**인터페이스:**
- 제공: `adminPortfolioQueryKeys.list`, `adminAutomationContentQueryKeys.services.list`, `.faqs.list` 및 no-store fetchers.
- 소비: 각 manager의 기존 저장 mutation 성공 후 자기 목록 query 무효화.

- [ ] **1단계: RED 테스트 작성**

도메인 key가 서로 겹치지 않고, 응답에 영향을 주는 ID/목록 scope별 key가 분리되며, GET fetcher가 `cache: "no-store"`를 사용함을 검증한다. 저장 mutation 성공 후 목록 무효화, 실패 시 무효화하지 않음을 확인한다.

- [ ] **2단계: RED 확인**

실행: `npm test -- --test-name-pattern='admin portfolio query|admin automation content query'`

예상: query modules가 없어 실패한다.

- [ ] **3단계: 최소 구현**

각 manager의 `load` 함수와 로컬 목록 상태를 `useQuery`로 교체한다. 탭 비활성화/재방문 시 cache를 사용하고, 편집 선택/폼은 현재 UI 상태로 둔다. 성공 저장 후 관련 list key를 무효화하고, 반환 엔티티를 목록에서 선택할 필요가 있는 경우 refetch 완료 뒤 기존 preferred-ID 선택 흐름을 보존한다. 실패 메시지, 필드 오류, 재시도 및 입력 유지 동작을 보존한다.

- [ ] **4단계: GREEN 확인**

실행: `npm test -- --test-name-pattern='admin portfolio query|admin automation content query'`

예상: key, no-store, 성공/실패 무효화 테스트 통과.

- [ ] **5단계: 커밋**

```bash
git add src/widgets/admin-portfolio src/widgets/admin-automation-content tests/admin-portfolio-query.test.ts tests/admin-automation-content-query.test.ts
git commit -m "feat: cache admin content reads"
```

### Task 4: 답변 초안 조회 및 mutation 캐시

**파일:**
- 생성: `src/features/manage-inquiry-reply/model/reply-draft-queries.ts`
- 수정: `src/features/manage-inquiry-reply/ui/inquiry-reply-draft-panel.tsx`
- 수정: `src/features/convert-inquiry-to-project/ui/inquiry-conversion-panel.tsx`
- 수정 테스트: `tests/inquiry-reply-draft-state.test.ts`, `tests/inquiry-conversion-api.test.ts` 또는 query 전용 테스트

**인터페이스:**
- 제공: `adminReplyDraftQueryKeys.detail(inquiryId)`, reply-draft GET fetcher.
- 소비: 문의 관련 key와 업무함 key. 성공 저장/재생성/전환에서 관련 query를 갱신/초기화한다.

- [ ] **1단계: RED 테스트 작성**

문의 ID별 draft key 분리, no-store GET, 같은 ID 재진입 30초 이내 fetch 미반복을 검사한다. draft 저장/재생성 성공 시 해당 draft, 문의 목록/상세, 업무함 key가 무효화 또는 반환 데이터로 갱신되고, 실패 시 무효화하지 않음을 검사한다. 전환 성공은 업무함 및 고객/프로젝트 목록도 무효화한다.

- [ ] **2단계: RED 확인**

실행: `npm test -- --test-name-pattern='admin reply draft cache|inquiry conversion cache'`

예상: query key/fetcher 또는 invalidation helper가 없어 실패한다.

- [ ] **3단계: 최소 구현**

draft GET을 `useQuery`로 전환하고 기존 사용자 편집 필드는 로컬 state로 유지한다. API 응답에서 반환되는 draft를 query cache와 편집 값에 동기화한다. 각 mutation의 성공 경로에서만 관련 query를 무효화한다. 전환 성공 시 반환된 문의 상태/ID를 문의 상세 캐시에 반영하고 영향받는 목록 및 업무함 페이지 체인을 초기화한다.

- [ ] **4단계: GREEN 확인**

실행: `npm test -- --test-name-pattern='admin reply draft cache|inquiry conversion cache'`

예상: no-store, 캐시 재사용, 성공/실패 일관성 assertions 통과.

- [ ] **5단계: 커밋**

```bash
git add src/features/manage-inquiry-reply src/features/convert-inquiry-to-project tests/inquiry-reply-draft-state.test.ts tests/inquiry-conversion-api.test.ts
git commit -m "feat: cache admin reply draft reads"
```

### Task 5: 견적·결제·고객/프로젝트 변경 후 업무함 무효화

**파일:**
- 수정: `src/widgets/admin-quote-workflow/ui/admin-quote-workflow.tsx`
- 수정: `src/widgets/admin-customer-projects/ui/project-payment-manager.tsx`
- 수정: `src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx`
- 수정: `src/widgets/admin-customer-projects/model/admin-customer-project-state.ts`
- 수정 테스트: `tests/admin-quote-api.test.ts`, `tests/admin-project-payment-query.test.ts`, `tests/admin-customer-project-query.test.ts` 또는 별도 invalidation 테스트

**인터페이스:**
- 소비: `adminWorkItemsQueryKeys.all`과 `customerProjectQueryKeys`/`adminProjectPaymentQueryKeys` 기존 key factory.
- 성공 mutation에만 업무함 query reset/invalidation을 수행해 활성 infinite query가 새 page 1과 새 snapshot으로 다시 시작하게 한다.

- [ ] **1단계: RED 테스트 작성**

견적 생성/버전 저장/발송/재시도/수동 전달/계약 승인, 결제·영수증 변경, 프로젝트 저장 각 성공 경로에서 업무함이 초기화되는지 검사한다. 실패 경로에서는 query 상태와 기존 페이지가 보존되는지 검사한다. 업무함 key prefix 무효화 뒤 활성 query의 첫 요청이 page 1이며 이전 `asOf`를 보내지 않는지 검사한다.

고객·프로젝트 목록이 25건을 넘을 때 API `total`이 전체 건수로 표시되고, 현재 페이지 `items.length`가 별도 로드 건수로 표시되는지도 state/UI model 테스트로 검사한다.

- [ ] **2단계: RED 확인**

실행: `npm test -- --test-name-pattern='admin mutation invalidates work items'`

예상: mutation 경로에서 업무함 query를 건드리지 않아 실패한다.

- [ ] **3단계: 최소 구현**

각 관련 mutation 성공 callback에서 공유 query key prefix를 사용해 업무함을 초기화하고 기존 견적/결제/고객/프로젝트 cache 업데이트·무효화 로직을 보존한다. 업무함 초기화 helper가 필요한 경우 dashboard component가 아닌 도메인 query model에 두어 feature-to-widget 의존을 피한다.

고객·프로젝트 list state에 응답 `total`을 전달하고 목록/페이지 영역에 “현재 N건 · 전체 M건”을 분리 표시한다. 기존 페이지 번호·검색·필터 동작은 유지한다.

- [ ] **4단계: GREEN 확인**

실행: `npm test -- --test-name-pattern='admin mutation invalidates work items'`

예상: 성공 경로는 새 snapshot의 첫 페이지로 재조회되고 실패 경로는 캐시를 보존한다.

- [ ] **5단계: 커밋**

```bash
git add src/widgets/admin-quote-workflow/ui/admin-quote-workflow.tsx src/widgets/admin-customer-projects/ui/project-payment-manager.tsx src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx tests
git commit -m "fix: invalidate admin work queue after mutations"
```

### Task 6: 통합 검증과 PR 인계

**파일:**
- 수정될 수 있음: 앞선 작업 파일과 테스트.
- PR 본문: 코드 외부에 작성.

- [ ] `npm test` 실행, 실제 pass/skip 수를 기록한다.
- [ ] `npm run lint` 실행 결과를 기록한다.
- [ ] `npm run type-check` 실행 결과를 기록한다.
- [ ] `npm run build -- --webpack` 실행 결과를 기록한다.
- [ ] `git diff --check origin/main...HEAD` 실행 결과를 기록한다.
- [ ] 브라우저 수동 확인은 가능한 범위에서 관리자 메뉴 A→B→A, 업무함 그룹/정렬/25건 초과 페이지 추가, 오류/재시도 및 360/768/1280px 레이아웃을 점검하고 미확인 항목을 PR에 명시한다.
- [ ] feature branch를 push하고 `## [프론트 에이전트]`로 시작하는 PR을 생성한다. 범위/API 계약/캐시·mutation/검증 결과/수동 확인/제외 작업을 기록한다. 별도 QA 재검증을 요청하며 원격 DB·배포·머지는 하지 않는다.

## 계획 자체 검토

- 설계의 모든 요구(30초 캐시, 5분 GC, query key 분리, no-store, infinite pagination, 동일 `asOf`, 전체·로드 건수, mutation 무효화, API 계약 유지)가 작업 1~5 및 검증 작업에 대응한다.
- 공개 query key와 pageParam 형식은 작업 1에서 정의하고, 이후 mutation 테스트/구현은 같은 key prefix를 사용한다.
- 동적 입력은 group/sort/pageSize, entity ID, API 오류 및 `hasNextPage` 종료를 테스트에 포함한다.
- 저장소 테스트는 Node test runner 기반이므로 React 컴포넌트 DOM 테스트 의존성을 새로 도입하지 않는다. QueryClient의 실제 query cache 동작을 테스트한다.
