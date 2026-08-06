# 현재 작업

기준일: 2026-08-06

## 현재 목표

결제·입금·매출 기능은 후순위로 보류한다. 현재 작업은 포트폴리오 MVP이며, 관리자가 항목을 생성·수정·게시하고 공개 홈페이지에는 게시된 항목만 노출되게 한다.

설계와 구현 계획:

- `docs/superpowers/specs/2026-08-06-portfolio-feature-design.md`
- `docs/superpowers/plans/2026-08-06-portfolio-backend.md`
- `docs/superpowers/plans/2026-08-06-portfolio-frontend.md`

GitHub 작업:

- Backend: #19 `[Backend][ready] 포트폴리오 공개·관리자 API 구현`
- Frontend: #20 `[Frontend][blocked] 포트폴리오 관리·공개 UI 구현`
- QA: #21 `[QA][blocked] 포트폴리오 전체 흐름 검증`

## 작업 순서

1. Back이 #19를 `backend/portfolio-api` 브랜치에서 구현하고 PR을 생성한다.
2. QA가 #19 PR을 검증하고 역할 표기와 함께 판정을 남긴다.
3. Planner가 QA 코멘트와 PR diff를 검토해 병합하거나 수정 요청을 남긴다.
4. #19가 병합되면 Front가 최신 `origin/main`에서 `frontend/portfolio-ui` 브랜치를 만들고 #20을 구현한다.
5. QA가 #20 PR을 검증한다.
6. Planner가 Front PR을 검토해 병합하거나 수정 요청을 남긴다.
7. 두 PR 병합 후 QA가 #21의 실제 Supabase 전체 흐름을 검증한다.

같은 작업트리를 공유할 때 Front와 Back을 동시에 수정 작업에 투입하지 않는다. Front는 #19가 병합되기 전에 #20을 시작하지 않는다.

## 공통 코멘트 규칙

GitHub 이슈, PR, 리뷰 코멘트 첫 줄에 역할을 표시한다.

```text
**[Back Agent / 백엔드 에이전트]**
**[Front Agent / 프론트엔드 에이전트]**
**[QA Agent / QA 에이전트]**
**[Planner Agent / 플래너 에이전트]**
```

개발 에이전트는 PR을 직접 병합하지 않는다. QA는 제품 코드를 수정하지 않는다. 최종 병합 판단은 Planner가 한다.

## Backend #19

상태: ready

범위:

- 포트폴리오 DB 타입 별칭, API 계약, Zod 입력 검증
- 게시·비공개 전환 시 `published_at` 계산
- `GET /api/portfolio`
- `GET/POST /api/admin/portfolio`
- `GET/PATCH /api/admin/portfolio/[id]`
- 공개 게시 필터, 관리자 인증, slug 충돌, projectId 검증
- 도메인 단위 테스트

제외:

- 모든 UI
- DELETE API
- 이미지 업로드와 Supabase Storage
- 결제·입금·매출

완료 조건:

- Backend 계획 문서의 Tasks 1~5 완료
- lint, type-check, test, production build 통과
- 실제 Supabase에서 확인한 범위와 확인하지 못한 범위를 PR에 구분
- `main` 대상 PR 생성 후 Planner에게 보고

## Frontend #20

상태: blocked by #19

범위:

- 포트폴리오 폼 모델과 API payload 변환
- 관리자 목록, 생성·수정 폼, 게시 상태와 정렬 관리
- 공개 홈페이지 포트폴리오 카드 목록
- 로딩, 빈 상태, 오류, 저장 중, 성공 상태
- 이미지 없음·실패 대체 영역
- 모바일·데스크톱과 기본 접근성

제외:

- API, migration, RLS
- DELETE와 이미지 업로드
- 결제·입금·매출

완료 조건:

- #19 병합 후 최신 main에서 시작
- Frontend 계획 문서의 Tasks 1~5 완료
- lint, type-check, test, production build 통과
- 관리자 생성→수정→게시와 공개 홈 노출 확인
- `main` 대상 PR 생성 후 Planner에게 보고

## QA #21

상태: blocked by #19 PR

검증 순서:

1. Backend PR의 API 계약, 인증, 검증, 공개 범위 확인
2. Backend PR 병합 후 Frontend PR의 화면 상태, 사용자 흐름, 반응형 확인
3. 두 PR 병합 후 실제 Supabase에서 생성→수정→게시→공개 노출→비공개→공개 제거 확인

QA는 각 PR에 APPROVE 또는 REQUEST CHANGES를 남기고, 실패 항목에 재현 절차·기대 결과·실제 결과·로그·담당·심각도를 기록한다. 환경 장애는 코드 결함과 분리한다.

## 환경 주의사항

- 프로젝트 Node 기준은 `.nvmrc`의 `20.19.0`이다.
- 현재 환경에서 `next dev` 기본 Turbopack이 첫 페이지 컴파일에 멈춘 이력이 있으므로 수동 검증은 `npm run dev -- --webpack`을 사용한다.
- 기존 `.env.local`에 설정됐던 Supabase 호스트가 DNS `NXDOMAIN`이었던 이력이 있다. 실제 HTTP QA 전에 활성 Supabase project origin URL과 자격 증명을 확인한다.
- 환경변수 값과 키는 GitHub, 문서, 로그에 기록하지 않는다.

## 보류 범위

다음 기능은 별도 지시 전까지 구현하지 않는다.

- 결제, 입금, 예상 매출, 확정 매출, 미수금
- 포트폴리오 이미지 파일 업로드
- 포트폴리오 삭제
- 포트폴리오 개별 상세 페이지
- AI 답변, 제안서, 계약서, 아임웹 코드 생성
