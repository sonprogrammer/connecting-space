# 파일 소유권과 수정 범위

목표: 프론트엔드 세션과 백엔드 세션이 병렬로 작업하되 같은 파일을 동시에 수정하지 않도록 한다.

현재 저장소는 초기 상태이므로 FSD(Feature-Sliced Design)를 기준으로 프로젝트를 구성한다.

## FSD 레이어 규칙

이 프로젝트는 Next.js App Router를 사용하므로 `src/app`을 라우팅 셸로 사용한다. Next.js의 Pages Router와 충돌할 수 있는 `src/pages`는 만들지 않는다.

허용 레이어:

- `src/app`: 라우트, 레이아웃, provider, route handler entrypoint
- `src/widgets`: 여러 기능을 조합한 화면 블록
- `src/features`: 사용자의 행동 단위 기능
- `src/entities`: 도메인 모델, 도메인 타입, 도메인 API, 도메인 UI
- `src/shared`: 공통 UI, lib, config, API client, 공통 타입
- `supabase`: migration, seed, RLS, storage policy

의존성 방향:

```text
src/app -> src/widgets -> src/features -> src/entities -> src/shared
```

아래 레이어가 위 레이어를 import하지 않는다.

## 공통 규칙

- 공통 타입/API 계약을 바꿀 때는 관련 세션 문서나 PR 설명에 영향 범위를 남긴다.
- 비밀값은 `.env.local`에만 둔다. `.env.example`에는 키 이름만 둔다.
- Supabase 서비스 롤 키, DB 비밀번호, AI API 키는 어떤 문서에도 기록하지 않는다.
- 생성된 타입 파일은 백엔드 세션이 갱신하고 프론트엔드 세션은 사용만 한다.

## 프론트엔드 소유

프론트엔드 세션이 주로 수정한다.

- `src/app/(public)/**`
- `src/app/admin/**`의 라우트/레이아웃/화면 조립
- `src/widgets/**`
- `src/features/**/ui/**`
- `src/features/**/model/**`
- `src/entities/**/ui/**`
- `src/entities/**/model/**`
- `src/shared/ui/**`
- `src/shared/styles/**`
- `public/**`
- `tailwind.config.*`
- `components.json`
- Playwright의 화면 흐름 테스트 중 UI 선택자와 사용자 시나리오

프론트엔드 세션의 책임:

- 공개 사이트 홈, 서비스, 제작 과정, 가격, FAQ, 포트폴리오, 문의 폼 UI
- 관리자 대시보드, 문의/고객/프로젝트/매출/포트폴리오 화면
- AI 결과 편집, 저장 요청, 복사, 재생성 UI
- 반응형, 접근성, 로딩/빈 상태/오류 상태

프론트엔드 세션이 피해야 할 수정:

- Supabase RLS 정책
- 마이그레이션 SQL
- 서버 전용 AI 호출 코드
- 서비스 롤 키를 사용하는 코드

## 백엔드 소유

백엔드 세션이 주로 수정한다.

- `supabase/**`
- `src/app/api/**`
- `src/shared/api/**`
- `src/shared/config/**`
- `src/shared/lib/supabase/**`
- `src/shared/lib/server/**`
- `src/shared/lib/auth/**`
- `src/shared/lib/ai/**`
- `src/shared/types/**`
- `src/entities/**/api/**`
- `src/entities/**/server/**`
- `src/features/**/api/**`
- `src/features/**/server/**`
- `src/features/**/schemas/**`
- `src/entities/**/schemas/**`
- `src/shared/types/database.generated.ts`
- `src/shared/types/api.ts`
- API, RLS, Auth 중심 테스트

백엔드 세션의 책임:

- Supabase Auth와 관리자 접근 제한
- 관리자, 문의, 고객, 프로젝트, 결제/입금, 포트폴리오, AI 생성 기록 테이블
- RLS와 Storage 정책
- 공개 문의 등록 API와 관리자 API 분리
- Zod 서버 검증
- AI API 서버 호출, 프롬프트 템플릿, 사용량/오류 기록
- 매출 합계와 미수금 계산

백엔드 세션이 피해야 할 수정:

- 랜딩 페이지 디자인
- shadcn/ui 컴포넌트 스타일
- 화면 레이아웃과 반응형 CSS
- 프론트엔드 상태 관리 구조의 임의 변경

## 공동 수정 가능 파일

공동 수정 파일은 먼저 현재 내용을 읽고 필요한 최소 범위만 바꾼다.

- `package.json`
- `next.config.*`
- `tsconfig.json`
- `.env.example`
- `README.md`
- `docs/**`
- `tests/**`

공동 파일 수정 원칙:

- 프론트엔드 세션은 UI에 필요한 패키지와 스크립트만 추가한다.
- 백엔드 세션은 서버, Supabase, 검증, AI에 필요한 패키지와 스크립트만 추가한다.
- 같은 파일에서 충돌이 예상되면 한 세션이 먼저 API 계약을 문서화하고 다른 세션이 따라간다.

## 추천 초기 폴더 구조

```text
src/
  app/
    (public)/
    admin/
    api/
    providers/
  widgets/
    public-home/
    admin-dashboard/
    inquiry-detail/
  features/
    submit-inquiry/
    update-inquiry-status/
    convert-inquiry-to-project/
    manage-payment/
    generate-ai-draft/
    generate-imweb-code/
  entities/
    inquiry/
    customer/
    project/
    payment/
    portfolio/
    ai-generation/
  shared/
    api/
    config/
    lib/
      auth/
      supabase/
      server/
      ai/
    styles/
    types/
    ui/
supabase/
  migrations/
tests/
docs/
```

## Slice 내부 구조

필요한 파일만 만든다. 모든 slice에 모든 폴더를 강제로 만들지 않는다.

```text
src/features/submit-inquiry/
  api/
  model/
  schemas/
  ui/
  index.ts
```

공개 export는 각 slice의 `index.ts`에서 관리한다. 다른 slice의 내부 파일을 깊게 import하지 않는다.
