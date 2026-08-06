# 포트폴리오 기능 설계

기준일: 2026-08-06

## 목표

관리자가 포트폴리오 항목을 등록·수정·게시할 수 있고, 공개 홈페이지에는 게시된 항목만 노출되는 최소 기능을 완성한다. 결제·입금·매출, 이미지 파일 업로드, 삭제, 개별 포트폴리오 상세 페이지는 이번 범위에서 제외한다.

## 구현 순서

API 계약을 먼저 확정하는 순차 방식을 사용한다.

1. Back이 도메인 타입·검증 스키마·공개 조회 API·관리자 CRUD API를 구현하고 PR을 만든다.
2. QA가 Back PR의 인증, 검증, 공개 범위와 정적 검사를 확인한다.
3. Planner가 Back PR을 검토하고 병합한다.
4. Front가 병합된 API 계약을 사용해 관리자 UI와 공개 홈페이지 섹션을 구현하고 PR을 만든다.
5. QA가 Front PR의 사용자 흐름, 상태 처리, 반응형과 회귀를 확인한다.
6. Planner가 Front PR을 검토하고 병합한다.

Front와 Back은 같은 파일을 동시에 수정하지 않는다. 모든 GitHub 코멘트는 역할을 식별할 수 있도록 첫 줄에 `[Back Agent / 백엔드 에이전트]`, `[Front Agent / 프론트엔드 에이전트]`, `[QA Agent / QA 에이전트]`, `[Planner Agent / 플래너 에이전트]` 중 하나를 적는다.

## 기존 기반

- `public.portfolio_items` 테이블과 공개·관리자 RLS 정책이 `supabase/migrations/202607220001_core_schema.sql`에 존재한다.
- `src/shared/types/database.generated.ts`에 `portfolio_items` Row/Insert/Update 타입이 존재한다.
- 공개 RLS는 `is_published = true`인 행만 조회하도록 제한한다.
- 관리자 RLS는 `public.is_admin()`을 만족하는 인증 사용자에게 전체 관리를 허용한다.
- 관리자 Route Handler는 `getVerifiedAdminSupabase()`와 `jsonOk()`/`jsonError()` 패턴을 사용한다.

이번 기능에는 새 마이그레이션이나 Storage bucket을 추가하지 않는다. 기존 스키마와 RLS가 실제 Supabase 환경에 적용돼 있다는 전제에서 API를 구현하고, QA가 이 전제를 검증한다.

## 데이터 모델과 입력 규칙

관리 필드는 다음과 같다.

| API 필드 | DB 필드 | 규칙 |
| --- | --- | --- |
| `projectId` | `project_id` | 선택, UUID 또는 `null` |
| `title` | `title` | 필수, trim 후 1~160자 |
| `slug` | `slug` | 필수, 소문자 영문·숫자와 단일 하이픈 조합, 1~120자, DB unique |
| `summary` | `summary` | 선택, trim 후 최대 1000자 |
| `imageUrl` | `image_url` | 선택, 절대 HTTP/HTTPS URL 또는 빈 문자열 |
| `siteUrl` | `site_url` | 선택, 절대 HTTP/HTTPS URL 또는 빈 문자열 |
| `industry` | `industry` | 선택, trim 후 최대 80자 |
| `isPublished` | `is_published` | 선택, 생성 기본값 `false` |
| `sortOrder` | `sort_order` | 선택, 0 이상의 정수, 생성 기본값 `0` |

`publishedAt`은 클라이언트 입력으로 받지 않고 서버가 관리한다.

- 비공개에서 공개로 바뀔 때 현재 ISO 시각을 기록한다.
- 공개 상태를 유지한 수정에서는 기존 게시 시각을 유지한다.
- 공개에서 비공개로 바뀔 때 `null`로 되돌린다.
- 생성 시 `isPublished: true`이면 생성 시각을 기록한다.

slug 중복은 데이터베이스 unique 오류를 `409 PORTFOLIO_SLUG_CONFLICT`로 변환한다. 연결하려는 `projectId`가 존재하지 않는 경우 `400 INVALID_PORTFOLIO_PROJECT`를 반환한다.

## API 설계

모든 응답은 기존 `ApiResponse<T>`와 `jsonOk()`/`jsonError()` 형식을 따른다.

### 공개 조회

`GET /api/portfolio`

- 인증 없이 접근 가능하다.
- `is_published = true`인 항목만 반환한다.
- 정렬은 `sort_order ASC`, 동일 순서에서는 `published_at DESC`, 다시 동일하면 `created_at DESC`이다.
- 공개 응답 필드는 `id`, `title`, `slug`, `summary`, `image_url`, `site_url`, `industry`, `published_at`으로 제한한다.
- 초기 MVP에서는 최대 100개를 반환한다.

### 관리자 목록과 생성

`GET /api/admin/portfolio`

- 기존 관리자 access token 검증을 사용한다.
- 공개 여부와 관계없이 전체 항목을 `sort_order ASC`, `updated_at DESC`로 반환한다.
- 관리자 UI 편집에 필요한 전체 행을 반환한다.

`POST /api/admin/portfolio`

- 입력을 포트폴리오 생성 스키마로 검증한다.
- 생성 성공 시 전체 행과 HTTP 201을 반환한다.
- slug 중복은 409, 입력 오류는 400, 인증 실패는 기존 401/403 형식을 따른다.

### 관리자 상세와 수정

`GET /api/admin/portfolio/[id]`

- UUID 형식과 관리자 인증을 검증한다.
- 없는 항목은 `404 ADMIN_PORTFOLIO_NOT_FOUND`를 반환한다.

`PATCH /api/admin/portfolio/[id]`

- 하나 이상의 필드를 요구하는 부분 수정 스키마를 사용한다.
- 게시 상태 전환 규칙에 맞춰 `published_at`을 서버에서 계산한다.
- `updated_at`을 현재 ISO 시각으로 갱신한다.
- 없는 항목은 404, slug 충돌은 409를 반환한다.

이번 범위에는 `DELETE`를 만들지 않는다. 운영 중 항목 제거는 `isPublished: false`로 처리한다.

## Back 구성

새 포트폴리오 slice는 기존 project/customer 패턴을 따른다.

- `src/entities/portfolio/model/types.ts`: DB Row 별칭
- `src/entities/portfolio/api/contracts.ts`: 공개 목록과 관리자 응답 계약
- `src/entities/portfolio/schemas/portfolio.schema.ts`: id, 생성, 수정 스키마
- `src/entities/portfolio/index.ts`: 공개 export
- `src/app/api/portfolio/route.ts`: 공개 GET
- `src/app/api/admin/portfolio/route.ts`: 관리자 GET/POST
- `src/app/api/admin/portfolio/[id]/route.ts`: 관리자 GET/PATCH
- `tests/portfolio-schema.test.ts`: 입력 규칙과 게시 상태 계산의 단위 테스트

게시 시각 계산은 Route Handler 내부에 중복 작성하지 않고 `src/entities/portfolio/model/publication.ts`의 순수 함수로 분리한다. 이 함수는 현재 게시 상태, 기존 게시 시각, 다음 게시 상태, 현재 시각을 받아 다음 `published_at`을 반환하며 단위 테스트가 가능해야 한다.

## Front 구성

관리자 화면은 기존 `/admin` 대시보드 안에 포트폴리오 관리 widget을 추가한다. 별도 라우트나 내비게이션 체계는 이번 범위에서 만들지 않는다.

- `src/widgets/admin-portfolio/ui/admin-portfolio-manager.tsx`: 목록, 선택, 생성·수정 폼 조합
- `src/widgets/admin-portfolio/index.ts`: 공개 export
- `src/features/manage-portfolio/model/portfolio-form.ts`: API payload 변환과 폼 초기값
- `src/features/manage-portfolio/ui/portfolio-form.tsx`: 생성·수정 폼
- `src/features/manage-portfolio/index.ts`: 공개 export
- `src/widgets/public-portfolio/ui/public-portfolio-section.tsx`: 공개 카드 목록
- `src/widgets/public-portfolio/index.ts`: 공개 export
- `src/widgets/admin-dashboard/ui/admin-dashboard.tsx`: 관리자 widget 조립
- `src/widgets/public-home/ui/public-home.tsx`: 공개 섹션 조립

공개 홈페이지의 포트폴리오 섹션은 서비스와 제작 과정 사이에 배치하고 `id="portfolio"`를 사용한다. 공개 헤더에도 포트폴리오 앵커 링크를 추가한다.

카드는 이미지가 있을 때 미리보기를 표시하고, 없거나 로드에 실패하면 서비스 업종과 제목을 보여주는 중립적인 대체 영역을 사용한다. 사이트 URL이 있으면 새 탭 링크를 제공하고 `rel="noreferrer"`를 적용한다. 공개 항목이 없으면 섹션 자체를 숨기지 않고 준비 중이라는 짧은 빈 상태를 표시한다.

관리자 UI는 다음 상태를 명시적으로 처리한다.

- 목록 로딩, 빈 목록, 조회 실패
- 새 항목 작성, 기존 항목 선택·편집
- 저장 중, 저장 성공, 필드 검증 오류, 서버 오류
- 게시/비공개 상태와 정렬 순서
- 저장 후 목록 재조회 및 선택 항목 동기화

## 데이터 흐름

```text
관리자 폼
  -> POST/PATCH 관리자 API
  -> 서버 Zod 검증 및 관리자 인증
  -> portfolio_items 저장
  -> 관리자 목록 재조회

공개 홈페이지
  -> GET /api/portfolio
  -> 공개 RLS + is_published 필터
  -> 공개 필드만 카드로 렌더링
```

Front는 Supabase를 직접 호출하지 않고 Route Handler만 사용한다. Back은 UI 파일을 수정하지 않는다.

## 오류 처리

- 네트워크 실패는 사용자에게 다시 시도 가능한 메시지로 표시한다.
- Zod 오류의 `fieldErrors`는 해당 입력 필드 가까이에 표시한다.
- 401/403은 기존 관리자 인증 흐름을 유지하며 로그인 만료 안내를 표시한다.
- slug 409는 slug 필드 오류로 표시한다.
- 공개 API 실패 시 페이지 전체를 실패시키지 않고 포트폴리오 섹션에만 오류 상태를 표시한다.
- 서버 오류 메시지나 로그에 Supabase 키와 관리자 access token을 포함하지 않는다.

## 테스트와 검증

Back PR에서 확인한다.

- 생성/수정 스키마의 경계값과 빈 문자열 정규화
- slug 허용·거부 형식
- 게시·비공개 전환별 `published_at` 계산
- 공개 API가 비공개 행을 반환하지 않음
- 관리자 API의 미인증 요청 거절
- 생성, 조회, 수정, 404, slug 409
- `npm run lint`, `npm run type-check`, `npm test`, `npm run build`

Front PR에서 확인한다.

- 폼 값이 API payload로 정확히 변환됨
- 목록 로딩·빈 상태·실패·저장 성공 상태
- 공개 데이터만 카드로 표시되고 항목이 없을 때 빈 상태 표시
- 모바일/데스크톱 레이아웃과 키보드 입력, label 연결
- `npm run lint`, `npm run type-check`, `npm test`, `npm run build`

최종 QA는 실제 Supabase 환경에서 관리자 생성→수정→게시→공개 홈 노출→비공개 전환→공개 홈 제거 흐름을 검증하고 생성한 데이터를 정리한다.

## 완료 기준

- 미인증 사용자는 관리자 포트폴리오 API를 사용할 수 없다.
- 관리자는 항목을 생성하고 수정하며 게시 상태와 순서를 관리할 수 있다.
- 공개 홈페이지에는 게시된 항목만 지정된 순서로 표시된다.
- 비공개 전환한 항목은 공개 홈페이지에서 제거된다.
- 이미지가 없거나 실패해도 카드 레이아웃과 핵심 정보가 유지된다.
- 결제·입금·매출, 이미지 업로드, 삭제, 상세 페이지가 구현 범위에 섞이지 않는다.
- Back과 Front PR 각각의 정적 검사, 테스트, production build가 통과한다.
