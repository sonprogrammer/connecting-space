# Portfolio Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 포트폴리오를 생성·수정·게시하고 방문자가 공개 홈페이지에서 게시된 작업 사례를 볼 수 있게 한다.

**Architecture:** Front는 병합된 포트폴리오 Route Handler만 호출하며 Supabase에 직접 접근하지 않는다. 관리자 widget과 공개 widget을 분리하고, 폼 payload 변환은 순수 함수로 분리해 Node test runner에서 검증한다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, Lucide React, Node test runner

## Global Constraints

- Backend 포트폴리오 API PR이 병합된 최신 `origin/main`에서 브랜치를 만든다.
- 구현 전 `AGENTS.md`, `docs/file-ownership.md`, `docs/superpowers/specs/2026-08-06-portfolio-feature-design.md`를 읽는다.
- Next.js 코드를 작성하기 전에 관련 `node_modules/next/dist/docs/` 문서를 읽는다.
- `supabase/**`, `src/app/api/**`, `src/entities/**/schemas/**`, RLS를 수정하지 않는다.
- 결제·입금·매출, 이미지 업로드, 삭제, 상세 페이지를 구현하지 않는다.
- GitHub 코멘트 첫 줄은 `**[Front Agent / 프론트엔드 에이전트]**`로 시작한다.

---

### Task 1: 포트폴리오 폼 모델

**Files:**
- Create: `src/features/manage-portfolio/model/portfolio-form.ts`
- Create: `src/features/manage-portfolio/index.ts`
- Create: `tests/portfolio-form.test.ts`

**Interfaces:**
- Consumes: `AdminPortfolioDetail`, `CreatePortfolioInput`, `UpdatePortfolioInput`
- Produces: `PortfolioFormValues`, `emptyPortfolioForm`, `portfolioToFormValues()`, `buildPortfolioPayload()`

- [ ] **Step 1: 폼 변환 실패 테스트 작성**

`tests/portfolio-form.test.ts`에 다음 사례를 작성한다.

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildPortfolioPayload,
  portfolioToFormValues,
} from "../src/features/manage-portfolio/model/portfolio-form";

describe("portfolio form", () => {
  test("builds an API payload from form strings", () => {
    assert.deepEqual(buildPortfolioPayload({
      projectId: "",
      title: "  필라테스 스튜디오  ",
      slug: "pilates-studio",
      summary: "  예약 전환 사이트  ",
      imageUrl: "",
      siteUrl: "https://example.com",
      industry: " 피트니스 ",
      isPublished: true,
      sortOrder: "2",
    }), {
      projectId: null,
      title: "필라테스 스튜디오",
      slug: "pilates-studio",
      summary: "예약 전환 사이트",
      imageUrl: "",
      siteUrl: "https://example.com",
      industry: "피트니스",
      isPublished: true,
      sortOrder: 2,
    });
  });

  test("maps an API row to editable strings", () => {
    const values = portfolioToFormValues({
      id: "11111111-1111-4111-8111-111111111111",
      project_id: null,
      title: "필라테스 스튜디오",
      slug: "pilates-studio",
      summary: null,
      image_url: null,
      site_url: null,
      industry: null,
      is_published: false,
      published_at: null,
      sort_order: 0,
      created_at: "2026-08-06T00:00:00.000Z",
      updated_at: "2026-08-06T00:00:00.000Z",
    });
    assert.equal(values.sortOrder, "0");
    assert.equal(values.summary, "");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`

Expected: manage-portfolio 모듈이 없어 실패한다.

- [ ] **Step 3: 최소 폼 모델 구현**

`PortfolioFormValues`는 입력 컴포넌트와 일치하도록 `sortOrder`를 문자열로 두고 `isPublished`를 boolean으로 둔다. `buildPortfolioPayload()`는 문자열을 trim하고 빈 projectId를 `null`, 빈 sortOrder를 `0`으로 변환한다.

```ts
export type PortfolioFormValues = {
  projectId: string;
  title: string;
  slug: string;
  summary: string;
  imageUrl: string;
  siteUrl: string;
  industry: string;
  isPublished: boolean;
  sortOrder: string;
};
```

- [ ] **Step 4: 테스트 통과와 커밋**

Run: `npm test`

Expected: 모든 테스트 통과.

```bash
git add src/features/manage-portfolio tests/portfolio-form.test.ts
git commit -m "feat: 포트폴리오 폼 모델 추가"
```

### Task 2: 공개 포트폴리오 섹션

**Files:**
- Create: `src/widgets/public-portfolio/ui/public-portfolio-section.tsx`
- Create: `src/widgets/public-portfolio/index.ts`
- Modify: `src/widgets/public-home/ui/public-home.tsx`
- Modify: `src/app/(public)/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/portfolio`, `ApiResponse<PublicPortfolioListItem[]>`
- Produces: `<PublicPortfolioSection />`, `/#portfolio` 앵커

- [ ] **Step 1: Next.js client component 문서 확인**

Run: `sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`

Expected: client boundary와 serializable props 규칙을 확인한다.

- [ ] **Step 2: 공개 widget 상태 모델 구현**

`public-portfolio-section.tsx`를 client component로 만들고 mount 시 `/api/portfolio`를 `cache: "no-store"`로 호출한다. 상태는 다음 union으로 제한한다.

```ts
type PortfolioState =
  | { status: "loading" }
  | { status: "success"; items: PublicPortfolioListItem[] }
  | { status: "error"; message: string };
```

loading은 카드 skeleton 3개, 빈 배열은 `등록된 작업 사례를 준비 중입니다.`, error는 섹션 내부 재시도 버튼을 표시한다.

- [ ] **Step 3: 카드와 이미지 실패 상태 구현**

카드는 title, industry, summary를 표시한다. `site_url`이 있을 때만 새 탭 링크를 만들고 `target="_blank" rel="noreferrer"`를 적용한다. 이미지 URL이 없거나 `onError`가 발생하면 업종과 제목이 들어간 대체 영역을 렌더링한다.

- [ ] **Step 4: 공개 홈과 헤더 조립**

`PublicHome`에서 Services 섹션 다음에 `<PublicPortfolioSection />`을 배치한다. 공개 레이아웃 내비게이션에서 `/#portfolio` 링크 텍스트를 `포트폴리오`로 추가한다.

- [ ] **Step 5: 정적 검증과 커밋**

Run: `npm run type-check`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

```bash
git add src/widgets/public-portfolio src/widgets/public-home/ui/public-home.tsx 'src/app/(public)/layout.tsx'
git commit -m "feat: 공개 포트폴리오 섹션 추가"
```

### Task 3: 관리자 포트폴리오 폼

**Files:**
- Create: `src/features/manage-portfolio/ui/portfolio-form.tsx`
- Modify: `src/features/manage-portfolio/index.ts`

**Interfaces:**
- Consumes: `PortfolioFormValues`, `buildPortfolioPayload()`, API `fieldErrors`
- Produces: `<PortfolioForm value onChange onSubmit disabled fieldErrors />`

- [ ] **Step 1: controlled form 구현**

다음 props 계약으로 구현한다.

```ts
type PortfolioFormProps = {
  value: PortfolioFormValues;
  onChange: (value: PortfolioFormValues) => void;
  onSubmit: () => void;
  disabled: boolean;
  submitLabel: string;
  fieldErrors: Record<string, string[]>;
};
```

title, slug, summary, imageUrl, siteUrl, industry, projectId, sortOrder, isPublished 입력을 제공한다. 모든 입력은 `label`과 `htmlFor`로 연결하고 서버 `fieldErrors`의 첫 메시지를 입력 가까이에 표시한다.

- [ ] **Step 2: 폼 제출과 키보드 동작 구현**

`form onSubmit`에서 `preventDefault()` 후 props의 `onSubmit()`을 호출한다. 저장 중에는 전체 입력과 제출 버튼을 비활성화하고 버튼 텍스트를 `저장 중`으로 바꾼다.

- [ ] **Step 3: 정적 검증과 커밋**

Run: `npm run type-check`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

```bash
git add src/features/manage-portfolio
git commit -m "feat: 관리자 포트폴리오 폼 추가"
```

### Task 4: 관리자 목록·생성·수정 widget

**Files:**
- Create: `src/widgets/admin-portfolio/ui/admin-portfolio-manager.tsx`
- Create: `src/widgets/admin-portfolio/index.ts`
- Modify: `src/widgets/admin-dashboard/ui/admin-dashboard.tsx`

**Interfaces:**
- Consumes: 관리자 포트폴리오 GET/POST/PATCH API, `<PortfolioForm />`
- Produces: `<AdminPortfolioManager />`

- [ ] **Step 1: 관리자 목록 상태와 조회 구현**

client component에서 다음 상태를 사용한다.

```ts
type ListState =
  | { status: "loading" }
  | { status: "success"; items: AdminPortfolioListItem[] }
  | { status: "error"; message: string };
```

`GET /api/admin/portfolio` 응답을 읽고 loading, 빈 상태, 오류와 다시 시도 버튼을 렌더링한다. 목록 항목에는 제목, slug, 게시 상태, 정렬 순서, 수정일을 표시한다.

- [ ] **Step 2: 새 항목과 기존 항목 선택 구현**

`새 포트폴리오` 버튼은 `emptyPortfolioForm`과 create mode를 선택한다. 기존 항목 선택은 `portfolioToFormValues()`로 form을 채우고 edit mode로 전환한다. 선택 항목은 `aria-current` 또는 시각적 테두리로 구분한다.

- [ ] **Step 3: POST/PATCH 저장 구현**

create mode는 `POST /api/admin/portfolio`, edit mode는 `PATCH /api/admin/portfolio/{id}`를 호출한다. 요청 body는 `buildPortfolioPayload()`를 사용한다. 성공하면 목록을 재조회하고 응답 id를 다시 선택한다.

400 응답의 `details.fieldErrors`는 폼에 전달하고, `PORTFOLIO_SLUG_CONFLICT`는 slug 오류 `이미 사용 중인 slug입니다.`로 변환한다. 401/403은 `관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.`를 표시한다. 나머지는 widget 상단 오류로 표시한다.

- [ ] **Step 4: 대시보드에 조립**

`AdminInquiryList` 다음, 오늘 할 일 섹션 전에 `<AdminPortfolioManager />`를 배치한다. 기존 문의 기능과 하드코딩된 통계는 이번 작업에서 수정하지 않는다.

- [ ] **Step 5: 전체 검증과 커밋**

Run: `npm run lint`

Expected: exit 0.

Run: `npm run type-check`

Expected: exit 0.

Run: `npm test`

Expected: 모든 테스트 통과, fail 0.

Run: `npm run build`

Expected: production build exit 0.

```bash
git add src/widgets/admin-portfolio src/widgets/admin-dashboard/ui/admin-dashboard.tsx
git commit -m "feat: 관리자 포트폴리오 관리 UI 추가"
```

### Task 5: 브라우저 확인과 PR 생성

**Files:**
- Verify only: all files from Tasks 1-4

**Interfaces:**
- Consumes: 완료된 Frontend 브랜치와 접근 가능한 Supabase 환경
- Produces: `main` 대상 Frontend PR

- [ ] **Step 1: 개발 서버 실행**

Run: `nvm use 20.19.0 && npm run dev -- --webpack`

Expected: 개발 서버가 Ready 상태가 되고 `/`와 `/admin`이 열린다. 현재 환경에서 Turbopack이 첫 컴파일에 멈춘 이력이 있어 검증에는 webpack을 사용한다.

- [ ] **Step 2: 관리자 사용자 흐름 확인**

관리자 로그인 후 새 항목 생성, 기존 항목 수정, 게시, 비공개 전환을 수행한다. 각 작업에서 저장 중·성공·오류 상태와 새로고침 후 데이터 유지를 확인한다.

- [ ] **Step 3: 공개 사용자 흐름 확인**

게시 항목만 공개 홈에 표시되는지, 정렬 순서가 맞는지, URL 없는 카드와 이미지 실패 카드가 깨지지 않는지 확인한다. 375px 모바일과 1440px 데스크톱 너비에서 가로 스크롤과 겹침이 없어야 한다.

- [ ] **Step 4: 변경 범위 확인**

Run: `git diff --stat origin/main...HEAD`

Expected: Front 소유 UI/model/test 파일만 포함되고 API, migration, RLS 파일은 없다.

- [ ] **Step 5: push와 PR 생성**

```bash
git push -u origin frontend/portfolio-ui
gh pr create --base main --head frontend/portfolio-ui --title "feat: 포트폴리오 관리 및 공개 UI 추가" --body "관리자 포트폴리오 생성·수정·게시 UI와 공개 홈페이지 포트폴리오 섹션을 추가합니다. 검증 결과와 브라우저 확인 범위는 커밋별 보고 내용을 따릅니다."
```

PR 본문에 검증 결과와 수동 확인 항목을 기록하고 직접 병합하지 않는다.
