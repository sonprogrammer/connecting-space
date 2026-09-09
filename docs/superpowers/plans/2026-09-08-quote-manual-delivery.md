# 견적 PDF 수동 발송 구현 계획

> 이 계획은 승인된 이슈 #67 설계를 TDD로 구현한다. 원격 Supabase에는 연결하거나 migration을 적용하지 않는다.

**목표:** 관리자용 수동 견적 PDF 발급 API와 원자적·멱등적인 토큰/감사 이력 수명주기를 추가한다.

**구조:** Node.js Route Handler는 인증과 snapshot 조회, 토큰·PDF 생성을 담당한다. PostgreSQL RPC는 토큰 해시, 발송 방식, 감사 이력과 재발급을 한 트랜잭션으로 처리한다. 공개 조회/승인 API는 기존 계약을 재사용한다.

**기술:** Next.js 16 Route Handlers, TypeScript, Zod, Supabase PostgreSQL, pdf-lib/fontkit, Node crypto, node:test

## Task 1: 토큰·요청 계약 RED/GREEN

- [x] `tests/quote-manual-token.test.ts`, `tests/quote-schema.test.ts`에 deterministic HMAC token과 요청 schema의 실패 테스트를 추가하고 예상 실패를 확인한다.
- [x] 전용 키 파서, 토큰 생성기, 요청 schema를 최소 구현한다.
- [x] 대상 테스트를 통과시키고 토큰/해시가 오류에 노출되지 않는지 점검한다.

## Task 2: PDF 문서 모델·렌더러 RED/GREEN

- [x] `tests/quote-manual-pdf.test.ts`에 한글 snapshot, 금액/날짜, 다중 페이지, 링크 annotation, PDF signature 테스트를 먼저 추가하고 실패를 확인한다.
- [x] PDF 의존성과 배포 가능한 한글 폰트를 추가한다.
- [x] `src/entities/quote/server/manual-pdf.ts`를 최소 구현하고 대상 테스트를 통과시킨다.

## Task 3: migration과 통합 상태 전이 RED/GREEN

- [x] `tests/quote-manual-migration.test.ts`에 enum, 감사 테이블, RLS, unique, 관리자 RPC, 이메일 finalize delivery method 계약 테스트를 추가하고 실패를 확인한다.
- [x] `tests/quote-manual-delivery.integration.test.ts`에 로컬 전용 원자 발급, 동일 키 멱등, 충돌, 재발급, 토큰 폐기와 공개 승인 회귀 시나리오를 작성한다.
- [x] `supabase/migrations/202609080001_quote_manual_delivery.sql`을 최소 구현한다.
- [x] 생성 DB 타입과 quote API 계약을 갱신한다.
- [x] migration 계약 테스트 및 로컬 Supabase 통합 테스트를 통과시킨다.

## Task 4: 관리자 PDF API RED/GREEN

- [x] `tests/quote-manual-api.test.ts`에 인증, 입력, 설정 누락, snapshot 오류, 신규/기존/재발급, download headers와 비밀 비노출 테스트를 추가하고 예상 실패를 확인한다.
- [x] `src/app/api/admin/quote-versions/[id]/manual-delivery/route.ts`를 구현한다.
- [x] 렌더링 성공 뒤에만 RPC가 호출되고 기존 멱등 행은 저장 시각으로 다시 렌더링되는지 검증한다.
- [x] 대상 및 기존 견적 API 테스트를 통과시킨다.

## Task 5: 문서·전체 검증·PR

- [x] `.env.example`과 `docs/qa/issue-67-quote-manual-delivery.md`에 설정과 QA 절차를 한글로 작성한다.
- [x] 원격 DB 명령 없이 로컬 migration reset과 전체 통합 테스트를 실행한다.
- [x] `npm run lint`, `npm run type-check`, `npm test`, `npm run build`, `git diff --check`를 새로 실행한다.
- [x] 요구사항별 diff 자체 검토 후 커밋·push한다.
- [x] main 대상 별도 PR을 만들고 QA 방법, 검증 결과, 원격 DB 미적용 사실을 한글로 작성한다.
