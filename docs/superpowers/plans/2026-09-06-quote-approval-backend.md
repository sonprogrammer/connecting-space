# 견적 버전·승인 백엔드 구현 계획

> **에이전트 작업 필수 조건:** 이 계획을 작업 단위로 실행할 때 `superpowers:executing-plans`를 사용한다. 각 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 관리자 견적 버전과 7일 승인 토큰을 안전하게 관리하고, 고객이 공개 API에서 견적을 조회한 뒤 명시적으로 한 번만 승인할 수 있는 백엔드를 구현한다.

**구조:** 핵심 무결성과 동시성은 Supabase PostgreSQL의 제약조건·RLS·트랜잭션 RPC가 담당한다. Next.js Route Handler는 관리자 인증, Zod 입력 검증, 토큰 난수 생성·해시, 안전한 오류 응답만 담당한다. 공개 API는 테이블에 직접 접근하지 않고 최소 권한 RPC만 호출한다.

**기술 스택:** Next.js App Router Route Handler, TypeScript, Zod, Supabase/PostgreSQL, Node.js `crypto`, Node.js test runner

**설계 문서:** `docs/superpowers/specs/2026-09-06-quote-approval-backend-design.md`

## 전체 제약사항

- 프론트엔드 소유 파일과 UI는 수정하지 않는다.
- 토큰은 32바이트 난수의 base64url 원문으로 발급하고 DB에는 SHA-256 해시만 저장한다.
- 승인 링크는 발급 후 정확히 7일 동안 유효하다.
- 공개 GET은 어떤 상태도 변경하지 않는다.
- 승인·버전 생성·토큰 교체·취소는 DB RPC에서 행 잠금과 함께 원자적으로 처리한다.
- migration은 로컬 Supabase에서만 검증하고 원격 DB에는 적용하지 않는다.
- API·문서·로그에 비밀키, 토큰, 해시, 불필요한 개인정보, DB 원본 오류를 노출하지 않는다.

---

### 작업 1: 견적 DB 스키마와 원자적 RPC

**파일:**
- 생성: `supabase/migrations/202609060002_quote_version_approval.sql`
- 생성: `tests/quote-migration.test.ts`
- 수정: `src/shared/types/database.generated.ts`

**인터페이스:**
- 생성 테이블: `quotes`, `quote_versions`, `quote_approval_tokens`, `quote_approvals`
- 생성 RPC: `create_quote_with_version`, `create_quote_version`, `issue_quote_approval_token`, `revoke_quote_approval_token`, `cancel_quote`, `get_public_quote_by_token`, `approve_quote_by_token`
- 생성 enum: `quote_status`

- [ ] **1단계: migration 계약 실패 테스트 작성**

  SQL 파일을 읽어 네 테이블, 금액·날짜 제약, 불변 트리거, RLS, 권한 회수, 고정 `search_path`, 공개·관리자 RPC가 모두 존재하는지 검증한다. 잘못된 권한이나 누락된 잠금 구문이 있으면 실패하도록 실제 SQL 계약을 검사한다.

- [ ] **2단계: 실패 확인**

  실행: `npm test -- tests/quote-migration.test.ts`

  예상: migration 파일이 없어 컴파일 또는 파일 읽기 단계에서 실패한다.

- [ ] **3단계: 최소 migration 구현**

  네 테이블과 enum을 만들고 다음 조건을 DB에서 강제한다.

  ```sql
  check (total_amount > 0),
  check (deposit_amount >= 0 and balance_amount >= 0),
  check (deposit_amount + balance_amount = total_amount),
  check (estimated_start_date is null or estimated_end_date is null
    or estimated_end_date >= estimated_start_date)
  ```

  각 관리자 RPC는 `if not public.is_admin() then raise ...` 검사를 수행한다. 공개 승인 RPC는 토큰 행과 견적 행을 `for update`로 잠근 뒤 유효성 재검사, 감사 행 삽입, 토큰 사용 처리, 견적 승인 처리를 한 트랜잭션에서 수행한다.

- [ ] **4단계: 생성 DB 타입 갱신**

  신규 테이블의 `Row`·`Insert`·`Update`, `quote_status`, 일곱 RPC의 Args·Returns를 `Database` 타입에 반영한다. 로컬 Supabase가 준비된 뒤 CLI 생성 결과와 대조한다.

- [ ] **5단계: 계약 테스트 통과 확인**

  실행: `npm test -- tests/quote-migration.test.ts`

  예상: PASS

- [ ] **6단계: 커밋**

  ```bash
  git add supabase/migrations/202609060002_quote_version_approval.sql tests/quote-migration.test.ts src/shared/types/database.generated.ts
  git commit -m "feat: 견적 승인 데이터 무결성 추가"
  ```

### 작업 2: 입력 스키마·계약·토큰 보안 모듈

**파일:**
- 생성: `src/entities/quote/schemas/quote.schema.ts`
- 생성: `src/entities/quote/api/contracts.ts`
- 생성: `src/entities/quote/server/token.ts`
- 생성: `src/entities/quote/server/rpc-errors.ts`
- 생성: `src/entities/quote/index.ts`
- 생성: `src/entities/inquiry/schemas/admin-inquiry.schema.ts`
- 생성: `tests/quote-schema.test.ts`
- 생성: `tests/quote-token.test.ts`

**인터페이스:**
- 생성: `quoteSnapshotSchema`, `createQuoteSchema`, `quoteIdSchema`, `approvalTokenSchema`, `adminCreateInquirySchema`
- 생성: `createApprovalToken(): { token: string; tokenHash: string }`
- 생성: `hashApprovalToken(token: string): string | null`
- 생성: `mapQuoteRpcError(error): { code: string; message: string; status: number }`

- [ ] **1단계: 스키마와 토큰 실패 테스트 작성**

  총액 1,000,000원과 선수금 300,000원·잔금 700,000원은 통과하고 합계 불일치, 음수, 안전하지 않은 정수, 역전 날짜, 빈 작업 범위는 실패하게 한다. 토큰은 32바이트 base64url만 허용하고 같은 원문의 해시는 항상 같은 64자리 소문자 16진수이며 생성 결과는 매번 달라야 한다.

- [ ] **2단계: 실패 확인**

  실행: `npm test -- tests/quote-schema.test.ts tests/quote-token.test.ts`

  예상: 모듈이 없어 실패한다.

- [ ] **3단계: 최소 스키마·계약·보안 모듈 구현**

  Zod `superRefine`으로 금액 합계와 날짜 순서를 검사한다. 선택 문자열은 trim 후 빈 문자열을 null 또는 undefined로 정규화한다. 토큰 생성과 해시는 Node.js `randomBytes(32)`와 `createHash("sha256")`만 사용한다.

- [ ] **4단계: 단위 테스트 통과 확인**

  실행: `npm test -- tests/quote-schema.test.ts tests/quote-token.test.ts`

  예상: PASS

- [ ] **5단계: 커밋**

  ```bash
  git add src/entities/quote src/entities/inquiry/schemas/admin-inquiry.schema.ts tests/quote-schema.test.ts tests/quote-token.test.ts
  git commit -m "feat: 견적 입력과 승인 토큰 검증 추가"
  ```

### 작업 3: 관리자 문의·견적 생성 및 상세 API

**파일:**
- 수정: `src/app/api/admin/inquiries/route.ts`
- 생성: `src/app/api/admin/quotes/route.ts`
- 생성: `src/app/api/admin/quotes/[id]/route.ts`
- 생성: `tests/admin-quote-api.test.ts`

**인터페이스:**
- `POST /api/admin/inquiries`
- `POST /api/admin/quotes`
- `GET /api/admin/quotes/[id]`

- [ ] **1단계: 관리자 API 실패 테스트 작성**

  인증 실패는 DB를 호출하지 않고 401을 반환해야 한다. 관리자 문의는 `source: "admin_manual"` 기본값과 관리자 메모를 저장한다. 견적 생성은 완전한 camelCase 스냅샷을 `create_quote_with_version`의 snake_case 인자로 전달한다. 상세 응답은 토큰 해시를 선택하거나 반환하지 않는다.

- [ ] **2단계: 실패 확인**

  실행: `npm test -- tests/admin-quote-api.test.ts`

  예상: 새 POST 및 견적 라우트가 없어 실패한다.

- [ ] **3단계: 최소 Route Handler 구현**

  기존 `getVerifiedAdminSupabase`, `jsonOk`, `jsonError`를 재사용한다. 동적 `params`는 설치된 Next.js 문서대로 `Promise<{ id: string }>`를 await한다. 모든 예상 DB 오류는 안정적인 도메인 코드로 바꾸고 원본 메시지는 숨긴다.

- [ ] **4단계: 관리자 API 테스트 통과 확인**

  실행: `npm test -- tests/admin-quote-api.test.ts`

  예상: PASS

- [ ] **5단계: 커밋**

  ```bash
  git add src/app/api/admin/inquiries/route.ts src/app/api/admin/quotes tests/admin-quote-api.test.ts
  git commit -m "feat: 관리자 문의와 견적 API 추가"
  ```

### 작업 4: 버전·취소·토큰 관리 API

**파일:**
- 생성: `src/app/api/admin/quotes/[id]/versions/route.ts`
- 생성: `src/app/api/admin/quotes/[id]/cancel/route.ts`
- 생성: `src/app/api/admin/quote-versions/[id]/approval-token/route.ts`
- 수정: `tests/admin-quote-api.test.ts`

**인터페이스:**
- `POST /api/admin/quotes/[id]/versions`
- `POST /api/admin/quotes/[id]/cancel`
- `POST /api/admin/quote-versions/[id]/approval-token`
- `DELETE /api/admin/quote-versions/[id]/approval-token`

- [ ] **1단계: 상태 변경 API 실패 테스트 작성**

  잘못된 UUID와 payload는 RPC 전에 400을 반환한다. 새 버전, 취소, 폐기는 올바른 RPC를 호출한다. 토큰 POST는 생성한 원문을 응답으로 한 번만 반환하고 RPC에는 해시만 전달해야 하며, DB 오류·다른 API 응답에는 원문이나 해시가 없어야 한다.

- [ ] **2단계: 실패 확인**

  실행: `npm test -- tests/admin-quote-api.test.ts`

  예상: 새 라우트가 없어 실패한다.

- [ ] **3단계: 최소 상태 변경 라우트 구현**

  인증과 검증 후 각각 하나의 RPC만 호출한다. 재발급 만료 시각은 서버 입력이 아니라 DB의 `now() + interval '7 days'` 결과를 반환해 시간 기준을 하나로 유지한다.

- [ ] **4단계: API 테스트 통과 확인**

  실행: `npm test -- tests/admin-quote-api.test.ts`

  예상: PASS

- [ ] **5단계: 커밋**

  ```bash
  git add src/app/api/admin/quotes src/app/api/admin/quote-versions tests/admin-quote-api.test.ts
  git commit -m "feat: 견적 버전과 승인 토큰 관리 추가"
  ```

### 작업 5: 공개 견적 조회·승인 API

**파일:**
- 생성: `src/app/api/quotes/[token]/route.ts`
- 생성: `src/app/api/quotes/[token]/approve/route.ts`
- 생성: `tests/public-quote-api.test.ts`

**인터페이스:**
- `GET /api/quotes/[token]`
- `POST /api/quotes/[token]/approve`

- [ ] **1단계: 공개 API 실패 테스트 작성**

  잘못된 토큰은 DB 호출 없이 404 또는 사용 불가 응답을 반환한다. GET은 `get_public_quote_by_token`만 호출하며 변경 RPC를 호출하지 않는다. 공개 응답은 이름과 견적 스냅샷 허용 필드만 포함하고 이메일, 전화번호, 해시를 포함하지 않는다. POST는 해시, 길이 제한 User-Agent, 신뢰 가능한 IP만 `approve_quote_by_token`에 전달한다.

- [ ] **2단계: 실패 확인**

  실행: `npm test -- tests/public-quote-api.test.ts`

  예상: 공개 라우트가 없어 실패한다.

- [ ] **3단계: 최소 공개 라우트 구현**

  익명 Supabase 클라이언트로 공개 RPC만 호출한다. 토큰 상태별 결과를 고객 정보가 없는 일정한 404/409/410 오류로 바꾸고 예기치 않은 오류는 일반화된 500으로 처리한다.

- [ ] **4단계: 공개 API 테스트 통과 확인**

  실행: `npm test -- tests/public-quote-api.test.ts`

  예상: PASS

- [ ] **5단계: 커밋**

  ```bash
  git add src/app/api/quotes tests/public-quote-api.test.ts
  git commit -m "feat: 공개 견적 조회와 승인 API 추가"
  ```

### 작업 6: 로컬 Supabase 통합 검증과 인계

**파일:**
- 생성: `tests/quote-approval.integration.test.ts`
- 생성: `docs/qa/issue-60-quote-approval.md`

**인터페이스:**
- 환경 플래그: `RUN_QUOTE_INTEGRATION_TESTS=1`
- 로컬 전용 테스트: URL 호스트가 `127.0.0.1` 또는 `localhost`일 때만 실행

- [ ] **1단계: 로컬 통합 실패 테스트 작성**

  관리자와 일반 사용자를 실제 로컬 Auth에 만들고 관리자·익명 RLS, 견적/버전 생성, 토큰 발급·재발급·폐기·만료, 승인 잠금, 승인 후 새 버전, 두 동시 승인 중 정확히 하나만 성공하는지 실제 DB에서 검증한다.

- [ ] **2단계: 로컬 Supabase 시작 및 migration 적용**

  실행: `supabase start`, `supabase db reset --local`

  원격 연결 명령과 `supabase db push --linked`는 실행하지 않는다.

- [ ] **3단계: 통합 테스트 실패 원인 확인 후 최소 SQL 보정**

  실행: `RUN_QUOTE_INTEGRATION_TESTS=1 npm test -- tests/quote-approval.integration.test.ts`

  예상: 첫 실행에서 발견한 실제 SQL 계약 문제만 보정하고, 이후 PASS

- [ ] **4단계: 생성 타입을 로컬 DB와 대조**

  실행: `supabase gen types typescript --local`

  생성 결과의 신규 테이블·enum·RPC 시그니처가 수동 반영 타입과 일치하는지 확인하고 필요한 차이만 수정한다.

- [ ] **5단계: QA 문서 작성**

  로컬 초기화, 관리자 준비, API 호출 순서, 예상 상태 코드, 동시 승인, 공개 정보 최소화, 원격 migration 미적용 사실을 한글로 기록한다.

- [ ] **6단계: 전체 검증**

  ```bash
  npm run lint
  npm run type-check
  npm test
  npm run build
  git diff --check
  ```

  예상: 모든 명령 성공

- [ ] **7단계: 최종 커밋**

  ```bash
  git add tests/quote-approval.integration.test.ts docs/qa/issue-60-quote-approval.md
  git commit -m "test: 견적 승인 로컬 통합 검증 추가"
  ```

- [ ] **8단계: PR과 이슈 보고**

  브랜치를 push하고 main 대상 PR을 만든다. PR과 이슈 #60 코멘트 첫 줄에 `**[Back Agent / 백엔드 에이전트]**`를 넣고 구현 결과, 검증 명령, 로컬 QA 방법, 원격 migration 미적용을 한글로 남긴다. PR은 직접 병합하지 않는다.
