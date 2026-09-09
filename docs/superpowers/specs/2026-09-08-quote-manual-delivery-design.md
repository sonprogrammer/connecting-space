# 견적 PDF 수동 발송 백엔드 설계

## 배경과 목표

이 문서는 이슈 #67의 백엔드 설계를 정의한다. Resend와 발신 도메인이 준비되기 전에도 관리자가 불변 견적 버전으로 승인 링크가 포함된 PDF를 발급하고, 외부 채널로 직접 전달할 수 있어야 한다. 기존 공개 견적 조회 GET과 명시적 승인 POST는 변경하지 않는다.

## API 계약

`POST /api/admin/quote-versions/{id}/manual-delivery`를 추가한다.

- 관리자 인증을 필수로 한다.
- JSON body는 `idempotencyKey` UUID와 선택적 `reissue` boolean을 받는다.
- 성공 시 `application/pdf`와 attachment `Content-Disposition`으로 PDF를 반환한다.
- `X-Quote-Manual-Delivery-Id`, `X-Quote-Expires-At` 응답 헤더로 감사 행과 만료 시각을 전달한다.
- 동일 버전과 동일 `idempotencyKey` 재호출은 같은 토큰·발급 시각·만료 시각으로 PDF를 다시 생성하며 DB 상태를 바꾸지 않는다.
- 활성 발급이 있는데 다른 키로 호출하면 409를 반환한다. 응답 유실이나 의도적인 교체는 새 키와 `reissue: true`로 요청한다.
- `reissue: true`는 이전 활성 토큰을 폐기하고 새 토큰과 감사 행을 하나의 트랜잭션으로 만든다.

## 토큰과 멱등성

`QUOTE_MANUAL_DELIVERY_TOKEN_KEY`는 base64로 인코딩한 정확히 32바이트 전용 키다. 토큰은 이 키로 `quoteVersionId`와 UUID `idempotencyKey`를 HMAC-SHA-256한 32바이트 값을 base64url로 표현한다. 고엔트로피 서버 비밀키 없이는 idempotency key만으로 토큰을 계산할 수 없다.

DB에는 다음 값만 저장한다.

- 승인 토큰의 SHA-256 해시
- idempotency key의 SHA-256 해시
- 견적·버전·토큰 식별자와 발급·만료·교체 시각

토큰 원문, 승인 URL, PDF bytes는 DB와 로그에 저장하지 않는다. 같은 idempotency key 재시도는 동일 토큰을 재생성하고 기존 감사 행의 시각으로 PDF를 다시 렌더링한다.

## 데이터 모델과 트랜잭션

후속 migration `202609080001_quote_manual_delivery.sql`을 추가한다.

- `quote_delivery_method` enum: `email`, `manual`
- `quotes.delivery_method`: 아직 발송되지 않았으면 null, 성공한 경로를 기록
- `quote_manual_deliveries`: 발급 감사 이력
  - `id`, `quote_id`, `quote_version_id`, `approval_token_id`
  - `generation`, `idempotency_key_hash`
  - `issued_at`, `expires_at`, `superseded_at`, `created_by`
- 버전별 `superseded_at is null` 부분 unique 인덱스로 활성 수동 발급 하나만 허용한다.
- `(quote_version_id, idempotency_key_hash)` unique 제약으로 재시도를 멱등 처리한다.

`issue_quote_manual_delivery` 관리자 RPC가 견적 행을 잠그고 다음을 원자 처리한다.

1. 동일 idempotency hash의 기존 감사 행이면 `existing`으로 반환한다.
2. 선택한 버전이 최신 버전이고 견적이 발급 가능한 상태인지 검증한다.
3. 다른 활성 수동 발급 또는 이메일 발송 작업이 있으면 `reissue` 없는 요청은 충돌 처리한다.
4. 재발급이면 기존 활성 토큰을 폐기하고 연결된 발송 generation을 supersede한다.
5. 새 승인 토큰 해시와 감사 행을 만들고 정확히 7일 만료를 설정한다.
6. 견적을 `sent`, `delivery_method = manual`로 바꾼다.

PDF 렌더링은 RPC 전에 수행한다. 따라서 렌더링 실패 시 DB 상태가 바뀌지 않는다. RPC가 동시 요청의 기존 행을 반환하면 그 행의 발급·만료 시각으로 PDF를 다시 렌더링한다.

자동 이메일 finalize RPC는 성공 시 `delivery_method = email`도 기록하도록 후속 migration에서 교체한다. 수동 발급이 기존 이메일 토큰을 폐기하면 기존 trigger가 이메일 작업을 supersede한다. 반대로 이메일 발송 성공 시 최신 발송 방식을 email로 기록한다.

## PDF 생성

Node.js Route Handler에서 `pdf-lib`와 내장 한글 폰트를 사용한다. PDF는 불변 견적 버전과 문의 고객명으로만 구성하며 다음 내용을 포함한다.

- 고객명, 견적 제목과 본문
- 작업 범위 목록
- 총액, 선수금·잔금 금액 및 조건
- 예상 작업 기간
- 발급·만료 시각
- 공개 견적 확인·승인 URL과 클릭 가능한 링크 annotation

긴 본문과 작업 항목은 페이지 단위로 줄바꿈하고, 사용자 입력은 파일명이나 응답 헤더에 넣지 않는다.

## 오류와 보안

- UUID/body/환경변수/견적 snapshot을 Zod와 전용 파서로 검증한다.
- 인증 실패 401, 잘못된 입력 400, 없는 버전 404, 발급 불가·재발급 필요 409, 설정 누락 503으로 정규화한다.
- 응답과 오류에는 토큰, 토큰 해시, idempotency hash, 승인 URL, 고객 연락처, Supabase 원본 오류를 포함하지 않는다.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_EMAIL_ENCRYPTION_KEY`는 참조하지 않는다.
- 새 테이블은 RLS를 활성화하고 관리자는 읽기만, 쓰기는 보안 RPC와 service role만 허용한다.

## 테스트와 QA

- 토큰: 동일 입력 재현, 버전/키 변경 시 분리, 잘못된 전용 키 거부
- PDF: 한글 snapshot 매핑, 페이지 생성, 승인 URL link annotation, 유효한 PDF bytes
- API: 인증, 환경변수, 입력, 성공 download headers, 동일 키 재호출, 재발급, 안전한 오류
- migration 계약: enum/컬럼/RLS/unique/RPC/권한/finalize email 방식 기록
- 로컬 Supabase 통합: 원자 발급, 동일 키 멱등성, 동시 중복 방지, 재발급 폐기, 7일 만료, PDF 실패 시 무변경, 공개 GET/POST 회귀
- 전체 lint, type-check, test, production build

원격 Supabase migration은 실행하지 않는다. PR에는 로컬 환경 준비, API 호출 순서, PDF 육안 확인 항목, 공개 승인 확인 방법과 원격 DB 미적용 사실을 한글로 기록한다.
