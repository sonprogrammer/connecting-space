# 고객·프로젝트 관리 UI 설계

## 목표

관리자가 문의 전환으로 생성된 고객과 프로젝트를 관리자 화면에서 검색·필터링하고, 목록에서 항목을 선택해 상세 정보를 확인·수정할 수 있게 한다.

## 범위와 제약

- 프론트엔드 UI, 상태 변환, 폼 payload, 회귀 테스트만 변경한다.
- 기존 `/api/admin/customers`, `/api/admin/customers/:id`, `/api/admin/projects`, `/api/admin/projects/:id` 계약을 그대로 사용한다.
- Supabase 원격 DB, migration 파일, 백엔드 API route는 변경하지 않는다.
- `401`/`403`은 기존 관리자 로그인 만료 안내 흐름으로 처리한다.
- 목록·상세·수정은 기존 관리자 대시보드의 단일 페이지 안에서 동작한다.

## 구조

`AdminCustomerProjectManager` 위젯을 `AdminDashboard`에 추가한다. 위젯은 고객/프로젝트 탭을 제공하며 각 탭은 독립된 목록 상태, 선택된 ID, 상세 상태, 편집 폼 상태를 가진다. API 응답은 `ApiResponse<T>`로 해석하고, 목록 응답의 페이지 메타데이터로 이전·다음 페이지를 제어한다.

고객 탭은 `GET /api/admin/customers?q=&page=&pageSize=20&sort=created_at&direction=desc`와 `GET/PATCH /api/admin/customers/:id`를 사용한다. 프로젝트 탭은 `GET /api/admin/projects?q=&status=&page=&pageSize=20&sort=created_at&direction=desc`와 `GET/PATCH /api/admin/projects/:id`를 사용한다. 연결된 문의 ID, 고객 ID, 프로젝트 ID는 상세 화면에 표시하고, 두 탭 사이의 선택 이동은 현재 목록 데이터에 존재하는 연결 ID를 사용한다.

순수 로직은 `src/widgets/admin-customer-projects/model/`에 둔다. 목록 상태 변환, 상태 라벨, 폼 초기값·payload, 저장 오류 필드 매핑을 UI와 분리해 단위 테스트한다. UI는 기존 `AdminPortfolioManager`의 로딩·빈 상태·오류·저장 성공 패턴을 따른다.

## UI 동작

- 탭 버튼은 `aria-selected`와 키보드 포커스 스타일을 제공한다.
- 검색은 명시적인 검색 버튼과 Enter 제출로 요청하며, 새 검색 시 페이지를 1로 되돌린다.
- 프로젝트 상태 필터에는 planning, in_progress, review, completed, paused, cancelled를 표시한다.
- 목록 항목은 실제 `button`으로 제공하고 선택된 항목을 `aria-current`로 표시한다.
- 상세 로딩 중에는 상태 영역을, 목록이 비었을 때는 빈 상태를, 네트워크/API 오류에는 재시도 버튼을 표시한다.
- 저장 중에는 폼 입력과 저장 버튼을 비활성화하고, 성공 시 목록과 상세를 저장 응답으로 갱신한다.
- 모바일에서는 목록과 상세가 세로로 쌓이고, 넓은 화면에서는 두 열로 배치한다.

## 테스트와 검증

- 고객/프로젝트 폼 payload와 목록 상태 변환을 단위 테스트한다.
- 탭·목록 선택·상태 라벨의 서버 렌더 가능한 UI 조각을 회귀 테스트한다.
- 구현 중에는 변경 관련 테스트, lint, type-check만 실행한다.
- 최종 푸시 직전에 전체 테스트와 `npm run build -- --webpack`을 각각 한 번 실행한다.
- 최종 결과는 `main` 대상 별도 PR에 기록하고 직접 머지하지 않는다.
