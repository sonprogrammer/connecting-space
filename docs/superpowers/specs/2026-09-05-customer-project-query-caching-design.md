# 고객·프로젝트 관리 조회 캐싱 설계

## 목표

관리자 고객·프로젝트 관리 화면의 목록·상세 조회를 TanStack Query로 캐싱해 반복 선택은 캐시 데이터로 즉시 표시하고, 백그라운드 재검증으로 최신성을 유지한다.

## 범위와 제약

- `@tanstack/react-query`를 관리자 영역에만 도입한다.
- 기존 `/api/admin/customers`, `/api/admin/customers/:id`, `/api/admin/projects`, `/api/admin/projects/:id`, `/api/admin/inquiries/:id` 계약을 그대로 사용한다.
- API route, 원격 DB, migration, 공개 페이지 캐싱 정책은 변경하지 않는다.
- 기존 인증 만료·404·네트워크 오류·연결 이동 동작을 유지한다.

## 구조

`src/app/admin/layout.tsx`에서 Client `AdminQueryProvider`를 렌더링해 관리자 라우트 하위에 `QueryClientProvider`를 제공한다. `QueryClient` 기본 정책은 `staleTime: 30_000`, `gcTime: 300_000`으로 둔다. 목록·상세 query 함수와 key는 `src/widgets/admin-customer-projects/model/admin-customer-project-queries.ts`에 둔다.

query key는 다음처럼 모든 조회 조건을 포함한다.

- `customers.list(page, query)`
- `projects.list(page, query, status)`
- `customers.detail(id)`
- `projects.detail(id)`
- `inquiries.detail(id)`

목록 query는 `placeholderData: keepPreviousData`를 사용해 페이지 이동 중 기존 결과를 유지한다. 상세 query는 캐시 데이터가 있으면 `isLoading` 대신 데이터를 렌더링하고 `isFetching`으로 백그라운드 재검증 상태만 표시한다. query 함수는 HTTP/API 오류를 공통 오류 객체로 변환하며 401/403은 기존 관리자 로그인 만료 메시지로 표시한다.

## 저장·새로고침·연결 이동

- 고객 PATCH 성공: 해당 고객 상세 cache를 응답으로 즉시 갱신하고 고객 목록 query들을 invalidate한다.
- 프로젝트 PATCH 성공: 해당 프로젝트 상세 cache를 응답으로 즉시 갱신하고 프로젝트 목록 query들을 invalidate한다.
- 새로고침: 현재 탭의 목록 query와 선택된 상세 query를 명시적으로 `refetch`한다.
- 고객→프로젝트: 고객의 `inquiry_id`로 문의 상세를 query한 뒤 `converted_project_id` 프로젝트 상세 query를 사용한다.
- 프로젝트→고객: `customer_id` 고객 상세 query를 사용한다.
- 문의 이동: 기존 `/admin#inquiry-{id}` hash navigation을 유지한다.

## 테스트와 검증

- query key가 페이지·검색어·상태별로 분리되는지 단위 테스트한다.
- QueryClient에 저장된 상세 cache가 PATCH 응답으로 즉시 교체되고 목록 query가 invalidate되는지 테스트한다.
- 캐시가 있는 상세 조회가 전체 loading 상태가 아닌 데이터+백그라운드 fetching 상태로 처리되는 UI 모델을 테스트한다.
- 구현 중에는 관련 테스트, lint, type-check만 실행한다.
- 최종 push 직전에 전체 테스트와 `npm run build -- --webpack`을 각각 실행한다.
