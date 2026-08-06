# Portfolio Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게시된 포트폴리오의 공개 조회와 관리자 전용 생성·조회·수정 API를 제공한다.

**Architecture:** 기존 `project` entity와 관리자 Route Handler 패턴을 그대로 따라 `portfolio` entity를 추가한다. 공개 API는 anon Supabase client와 RLS를 사용하고 서버에서도 `is_published = true`를 명시하며, 관리자 API는 기존 access token 검증 흐름을 사용한다.

**Tech Stack:** Next.js 16.2.11 App Router, TypeScript 5, Zod 4, Supabase JS 2, Node test runner

## Global Constraints

- 구현 전 `AGENTS.md`, `docs/file-ownership.md`, `docs/superpowers/specs/2026-08-06-portfolio-feature-design.md`를 읽는다.
- Next.js 코드를 작성하기 전에 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`를 읽는다.
- 결제·입금·매출, 이미지 업로드, DELETE API, 포트폴리오 상세 페이지를 구현하지 않는다.
- UI 파일을 수정하지 않는다.
- 비밀값을 코드, 테스트, 로그, PR 본문에 기록하지 않는다.
- GitHub 코멘트 첫 줄은 `**[Back Agent / 백엔드 에이전트]**`로 시작한다.

---

### Task 1: 포트폴리오 도메인 계약과 입력 검증

**Files:**
- Create: `src/entities/portfolio/model/types.ts`
- Create: `src/entities/portfolio/model/publication.ts`
- Create: `src/entities/portfolio/api/contracts.ts`
- Create: `src/entities/portfolio/schemas/portfolio.schema.ts`
- Create: `src/entities/portfolio/index.ts`
- Create: `tests/portfolio-schema.test.ts`

**Interfaces:**
- Consumes: `Database["public"]["Tables"]["portfolio_items"]["Row"]`
- Produces: `PortfolioRow`, `PublicPortfolioListItem`, `AdminPortfolioListItem`, `CreatePortfolioInput`, `UpdatePortfolioInput`, `resolvePublishedAt()`

- [ ] **Step 1: 입력 스키마와 게시 시각 계산의 실패 테스트 작성**

`tests/portfolio-schema.test.ts`에 다음 동작을 구체적으로 검증한다.

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createPortfolioSchema,
  resolvePublishedAt,
  updatePortfolioSchema,
} from "../src/entities/portfolio";

const validInput = {
  title: "필라테스 스튜디오",
  slug: "pilates-studio",
  summary: "예약 전환 중심의 아임웹 사이트",
  imageUrl: "https://example.com/portfolio/pilates.jpg",
  siteUrl: "https://example.com",
  industry: "피트니스",
  isPublished: false,
  sortOrder: 1,
};

describe("portfolio schemas", () => {
  test("accepts a normalized valid input", () => {
    const result = createPortfolioSchema.safeParse({
      ...validInput,
      title: "  필라테스 스튜디오  ",
      industry: "  피트니스  ",
    });
    assert.equal(result.success, true);
    if (!result.success) assert.fail("valid input must pass");
    assert.equal(result.data.title, "필라테스 스튜디오");
    assert.equal(result.data.industry, "피트니스");
  });

  test("rejects invalid slug and non-http URLs", () => {
    assert.equal(createPortfolioSchema.safeParse({ ...validInput, slug: "한글 slug" }).success, false);
    assert.equal(createPortfolioSchema.safeParse({ ...validInput, imageUrl: "ftp://example.com/a.jpg" }).success, false);
  });

  test("requires at least one update field", () => {
    assert.equal(updatePortfolioSchema.safeParse({}).success, false);
    assert.equal(updatePortfolioSchema.safeParse({ title: "수정 제목" }).success, true);
  });
});

describe("resolvePublishedAt", () => {
  const now = "2026-08-06T10:00:00.000Z";

  test("sets, preserves, and clears publication time", () => {
    assert.equal(resolvePublishedAt(false, null, true, now), now);
    assert.equal(resolvePublishedAt(true, "2026-08-01T00:00:00.000Z", true, now), "2026-08-01T00:00:00.000Z");
    assert.equal(resolvePublishedAt(true, "2026-08-01T00:00:00.000Z", false, now), null);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`

Expected: `Cannot find module '../src/entities/portfolio'` 또는 export 누락으로 실패한다.

- [ ] **Step 3: 최소 도메인 구현**

`portfolio.schema.ts`에 다음 계약을 구현한다.

```ts
const optionalHttpUrl = z
  .union([z.literal(""), z.url().max(500)])
  .refine((value) => value === "" || /^https?:\/\//.test(value), "URL must use http or https");

export const portfolioIdSchema = z.uuid();
export const createPortfolioSchema = z.object({
  projectId: z.uuid().optional().nullable(),
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().max(1000).optional().or(z.literal("")),
  imageUrl: optionalHttpUrl.optional(),
  siteUrl: optionalHttpUrl.optional(),
  industry: z.string().trim().max(80).optional().or(z.literal("")),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const updatePortfolioSchema = createPortfolioSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one portfolio field is required",
);
```

`publication.ts`에 다음 시그니처를 구현한다.

```ts
export function resolvePublishedAt(
  wasPublished: boolean,
  previousPublishedAt: string | null,
  willBePublished: boolean,
  now: string,
): string | null {
  if (!willBePublished) return null;
  if (wasPublished && previousPublishedAt) return previousPublishedAt;
  return now;
}
```

`contracts.ts`는 공개 응답을 다음 필드로 제한한다.

```ts
export type PublicPortfolioListItem = Pick<
  PortfolioRow,
  "id" | "title" | "slug" | "summary" | "image_url" | "site_url" | "industry" | "published_at"
>;
export type AdminPortfolioListItem = PortfolioRow;
export type AdminPortfolioDetail = PortfolioRow;
export type AdminPortfolioCreateResponse = PortfolioRow;
export type AdminPortfolioUpdateResponse = PortfolioRow;
```

- [ ] **Step 4: 도메인 테스트 통과 확인**

Run: `npm test`

Expected: 기존 16개와 새 포트폴리오 테스트가 모두 통과한다.

- [ ] **Step 5: Task 1 커밋**

```bash
git add src/entities/portfolio tests/portfolio-schema.test.ts
git commit -m "feat: 포트폴리오 도메인 계약 추가"
```

### Task 2: 게시된 포트폴리오 공개 조회 API

**Files:**
- Create: `src/app/api/portfolio/route.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient()`, `PublicPortfolioListItem`
- Produces: `GET /api/portfolio -> ApiResponse<PublicPortfolioListItem[]>`

- [ ] **Step 1: 설치된 Next.js Route Handler 문서 확인**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

Expected: Next.js 16 Route Handler의 `GET` export 및 응답 규칙을 확인한다.

- [ ] **Step 2: 공개 GET 구현**

`src/app/api/portfolio/route.ts`의 핵심 쿼리를 다음과 같이 작성한다.

```ts
const supabase = createSupabaseServerClient();
const { data, error } = await supabase
  .from("portfolio_items")
  .select("id, title, slug, summary, image_url, site_url, industry, published_at")
  .eq("is_published", true)
  .order("sort_order", { ascending: true })
  .order("published_at", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(100);
```

오류는 `PUBLIC_PORTFOLIO_READ_FAILED`와 HTTP 500으로 반환하고, 성공 시 `jsonOk<PublicPortfolioListItem[]>(data)`를 반환한다.

- [ ] **Step 3: 정적 검증**

Run: `npm run type-check`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 4: Task 2 커밋**

```bash
git add src/app/api/portfolio/route.ts
git commit -m "feat: 공개 포트폴리오 조회 API 추가"
```

### Task 3: 관리자 포트폴리오 목록과 생성 API

**Files:**
- Create: `src/app/api/admin/portfolio/route.ts`

**Interfaces:**
- Consumes: `getVerifiedAdminSupabase()`, `createPortfolioSchema`, `resolvePublishedAt()`
- Produces: `GET /api/admin/portfolio`, `POST /api/admin/portfolio`

- [ ] **Step 1: 관리자 GET 구현**

관리자 검증 후 다음 쿼리를 사용한다.

```ts
const { data, error } = await admin.supabase
  .from("portfolio_items")
  .select("*")
  .order("sort_order", { ascending: true })
  .order("updated_at", { ascending: false })
  .limit(100);
```

오류 코드는 `ADMIN_PORTFOLIO_READ_FAILED`를 사용한다.

- [ ] **Step 2: 관리자 POST 구현**

`createPortfolioSchema.safeParse()`로 검증한 뒤 camelCase를 DB 필드로 매핑한다. `isPublished` 기본값은 `false`, `sortOrder` 기본값은 `0`이며 `published_at`은 `resolvePublishedAt(false, null, isPublished, now)`로 계산한다.

projectId가 주어지면 먼저 다음 존재 확인을 수행한다.

```ts
const { data: project } = await admin.supabase
  .from("projects")
  .select("id")
  .eq("id", input.projectId)
  .maybeSingle();
```

없으면 `INVALID_PORTFOLIO_PROJECT`와 HTTP 400을 반환한다. insert 오류 `code === "23505"`는 `PORTFOLIO_SLUG_CONFLICT`와 HTTP 409로 변환한다. 성공 시 전체 행과 HTTP 201을 반환한다.

- [ ] **Step 3: 정적 검증**

Run: `npm run type-check`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 4: Task 3 커밋**

```bash
git add src/app/api/admin/portfolio/route.ts
git commit -m "feat: 관리자 포트폴리오 목록 생성 API 추가"
```

### Task 4: 관리자 포트폴리오 상세와 수정 API

**Files:**
- Create: `src/app/api/admin/portfolio/[id]/route.ts`

**Interfaces:**
- Consumes: `portfolioIdSchema`, `updatePortfolioSchema`, `resolvePublishedAt()`
- Produces: `GET /api/admin/portfolio/[id]`, `PATCH /api/admin/portfolio/[id]`

- [ ] **Step 1: id 검증과 상세 GET 구현**

기존 project 상세 Route Handler와 동일하게 `params: Promise<{ id: string }>`를 await하고 `portfolioIdSchema`로 검증한다. 잘못된 UUID는 `INVALID_PORTFOLIO_ID` 400, 없는 행은 `ADMIN_PORTFOLIO_NOT_FOUND` 404를 반환한다.

- [ ] **Step 2: PATCH 전 기존 행 조회 구현**

게시 시각 계산에 필요한 `is_published`, `published_at`을 포함해 기존 전체 행을 조회한다. 행이 없으면 업데이트를 시도하지 않고 404를 반환한다.

- [ ] **Step 3: 부분 수정 구현**

다음 게시 상태를 계산한다.

```ts
const nextPublished = input.isPublished ?? existing.is_published;
const now = new Date().toISOString();
const publishedAt = resolvePublishedAt(
  existing.is_published,
  existing.published_at,
  nextPublished,
  now,
);
```

입력에 존재하는 필드만 DB update 객체에 넣고, `published_at: publishedAt`, `updated_at: now`를 포함한다. projectId 변경 시 Task 3과 같은 프로젝트 존재 확인을 한다. slug unique 오류는 409로 변환한다.

- [ ] **Step 4: 전체 정적 검증과 테스트**

Run: `npm run lint`

Expected: exit 0.

Run: `npm run type-check`

Expected: exit 0.

Run: `npm test`

Expected: 모든 테스트 통과, fail 0.

Run: `npm run build`

Expected: Next.js production build exit 0이며 새 공개·관리자 포트폴리오 Route가 생성된다.

- [ ] **Step 5: Task 4 커밋**

```bash
git add src/app/api/admin/portfolio/[id]/route.ts
git commit -m "feat: 관리자 포트폴리오 상세 수정 API 추가"
```

### Task 5: PR 생성과 QA 인계

**Files:**
- Verify only: all files from Tasks 1-4

**Interfaces:**
- Consumes: 완료된 Backend 브랜치
- Produces: `main` 대상 Backend PR

- [ ] **Step 1: 변경 범위 확인**

Run: `git diff --stat origin/main...HEAD`

Expected: `src/entities/portfolio/**`, 포트폴리오 Route Handler, `tests/portfolio-schema.test.ts`만 포함되고 UI 파일은 없다.

- [ ] **Step 2: 최종 검증 결과 기록**

PR 본문에 lint, type-check, test의 전체 개수와 build 결과를 적는다. 실제 Supabase 검증을 못 했다면 통과로 쓰지 말고 환경 제약을 남긴다.

- [ ] **Step 3: push와 PR 생성**

```bash
git push -u origin backend/portfolio-api
gh pr create --base main --head backend/portfolio-api --title "feat: 포트폴리오 API 추가" --body "Backend 포트폴리오 도메인 계약, 공개 조회 API, 관리자 목록·생성·상세·수정 API를 추가합니다. 검증 결과와 실제 Supabase 확인 범위는 커밋별 보고 내용을 따릅니다."
```

PR을 직접 병합하지 않고 URL과 번호를 Planner에게 보고한다.
