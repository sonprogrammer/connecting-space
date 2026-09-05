# 고객·프로젝트 관리 UI 구현 계획

> 설계 명세: `docs/superpowers/specs/2026-09-05-customer-project-management-design.md`

## 목표

최신 `main`의 기존 관리자 API 계약만 사용해 고객·프로젝트 목록, 검색/필터, 상세 조회, 수정 흐름을 관리자 대시보드에 추가한다. 원격 DB, migration, 백엔드 API route는 변경하지 않는다.

## 작업 단계

1. **모델·순수 로직과 회귀 테스트**
   - 고객/프로젝트 상태 라벨, 목록 응답 정규화, 폼 초기값·payload, API 오류 메시지 변환을 `src/widgets/admin-customer-projects/model/`에 추가한다.
   - 순수 함수 테스트를 먼저 작성하고 통과시킨다.

2. **고객 관리 UI**
   - 고객 탭의 검색, 페이지 이동, 로딩/빈 상태/오류/인증 만료 상태를 구현한다.
   - 선택된 고객의 상세 조회와 수정 폼을 구현하고 저장 후 목록·상세를 갱신한다.

3. **프로젝트 관리 UI**
   - 프로젝트 탭의 검색, 상태 필터, 페이지 이동, 상태별 목록 표시를 구현한다.
   - 선택된 프로젝트의 상세 조회와 수정 폼을 구현하고 저장 후 목록·상세를 갱신한다.

4. **연결 이동·접근성·대시보드 통합**
   - 고객/프로젝트 탭 전환과 현재 목록에 로드된 연결 레코드 선택 이동을 추가한다.
   - 탭의 `aria-selected`, 목록 선택의 `aria-current`, 키보드 포커스, 반응형 1열/2열 레이아웃을 확인한다.
   - `AdminDashboard`에 위젯을 통합하고 UI 회귀 테스트를 추가한다.

5. **단계별 검증 및 PR**
   - 구현 중 변경 관련 테스트, lint, type-check만 실행한다.
   - 최종 푸시 직전에 전체 테스트와 `npm run build -- --webpack`을 각각 한 번 실행한다.
   - 전용 브랜치를 원격에 push하고 `main` 대상 별도 PR을 생성한다. PR 본문에 검증 결과를 남기며 직접 머지하지 않는다.

## 검증 명령

- 관련 테스트: `npm test -- --runInBand <관련 테스트>`
- 린트: `npm run lint`
- 타입 검사: `npm run type-check`
- 최종 전체 테스트: `npm test -- --runInBand`
- 최종 production build: `npm run build -- --webpack`
