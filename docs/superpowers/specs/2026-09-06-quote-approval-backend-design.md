# 견적 버전·승인 백엔드 설계

## 배경

이슈 #60은 상위 이슈 #57에서 정의한 견적 승인 흐름의 백엔드 경계를 구현한다. 사이트 밖에서 접수한 문의, 변경할 수 없는 발송 견적 버전, 만료되는 승인 링크, 고객의 명시적인 승인 동작을 지원해야 한다. 이메일 발송, 고객용 화면, 서명 계약서 처리, 프로젝트·결제 생성은 후속 이슈 범위로 남긴다.

## 목표

- 인증된 관리자가 사이트 밖에서 받은 문의를 등록할 수 있게 한다.
- 견적 본문, 작업 범위, 총액, 일정, 선수금·잔금 조건을 버전별 스냅샷으로 저장한다.
- 토큰 원문을 저장하지 않고 7일짜리 승인 토큰을 발급·교체·폐기한다.
- 읽기 전용 공개 GET API에서 필요한 견적 스냅샷만 반환한다.
- 명시적인 POST API를 통해 정확한 견적 버전 하나만 승인한다.
- 승인 감사 기록을 보존하고 동시 요청 중 하나만 성공하게 한다.
- 승인된 버전은 수정할 수 없게 하고, 승인 후 변경 사항은 새 버전으로 만든다.
- 테이블 접근은 관리자에게만 허용하고, 공개 DB 함수에는 필요한 최소 권한만 부여한다.

## 제외 범위

- 관리자 및 고객 UI
- 이메일 발송 및 Resend 연동
- 자동 만료 알림
- 계약서 PDF, 서명 확인, 고객·프로젝트 전환, 결제 생성
- 원격 Supabase migration 적용. migration은 로컬에서만 검증한다.

## 데이터 모델

### `quotes`

견적 하나의 생명주기를 나타낸다.

- `id uuid`: 기본 키
- `inquiry_id uuid`: 필수 `inquiries` 외래 키
- `status quote_status`: `draft`, `sent`, `approved`, `expired`, `cancelled`
- `latest_version_id uuid`: 현재 최신 버전 참조, nullable
- `approved_version_id uuid`: 승인된 버전 참조, nullable
- `created_by uuid`: 필수 관리자 참조
- `created_at`, `updated_at timestamptz`

하나의 문의에 여러 견적이 있을 수 있으며, 각 견적은 순서가 있는 버전 목록을 소유한다. `approved_version_id`는 승인 트랜잭션만 설정한다. 취소 상태는 현재 견적 승인 흐름에서 최종 상태로 취급한다.

### `quote_versions`

고객에게 표시되는 변경 불가능한 스냅샷이다.

- `id uuid`: 기본 키
- `quote_id uuid`: 필수 견적 외래 키
- `version_number integer`: 필수 버전 번호이며 견적 안에서 유일
- `title text`, `body text`
- `scope_items jsonb`: 비어 있지 않은 JSON 문자열 배열
- `total_amount integer`: 원화 총액이며 0보다 커야 함
- `estimated_start_date date`: 예상 시작일, nullable
- `estimated_end_date date`: 예상 종료일, nullable이며 시작일보다 빠를 수 없음
- `deposit_amount integer`, `balance_amount integer`: 각각 0 이상이며 합계가 `total_amount`와 같아야 함
- `deposit_terms text`, `balance_terms text`
- `created_by uuid`: 필수 관리자 참조
- `created_at timestamptz`

일반 애플리케이션 역할은 생성된 버전 행을 수정하거나 삭제할 수 없다. DB 트리거가 생성 후 수정을 거부한다. 변경 사항은 관리자 전용 RPC로 다음 버전을 생성해 반영한다. RPC는 상위 견적 행을 잠그고 `max(version_number) + 1`을 원자적으로 할당한다.

### `quote_approval_tokens`

- `id uuid`: 기본 키
- `quote_version_id uuid`: 필수 견적 버전 외래 키
- `token_hash text`: 유일한 SHA-256 16진수 해시. 원문은 저장하지 않음
- `expires_at timestamptz`: 발급 시각으로부터 정확히 7일 후
- `revoked_at`, `used_at timestamptz`: nullable
- `replaced_by_id uuid`: 교체 토큰 자기 참조, nullable
- `created_by uuid`: 필수 관리자 참조
- `created_at timestamptz`

버전마다 활성 토큰은 하나만 존재할 수 있다. 재발급 시 기존 활성 토큰을 잠그고 폐기한 뒤 같은 트랜잭션에서 새 토큰으로 교체한다. 서버는 32바이트 난수를 만들고 base64url 원문은 응답으로 한 번만 반환한다. RPC와 DB에는 SHA-256 해시만 전달한다.

### `quote_approvals`

- `id uuid`: 기본 키
- `quote_id uuid`: 필수 견적 외래 키
- `quote_version_id uuid`: 필수이며 유일한 견적 버전 외래 키
- `approval_token_id uuid`: 필수이며 유일한 승인 토큰 외래 키
- `approved_at timestamptz`
- `client_ip inet`: nullable
- `user_agent text`: nullable이며 API에서 길이를 제한함

감사 행은 추가만 가능하다. 각 버전과 토큰은 승인 기록 하나에만 연결되지만, 하나의 견적은 과거 여러 버전의 승인 기록을 보존할 수 있다. 토큰 원문과 불필요한 고객 개인정보는 기록하지 않는다.

## 상태 및 무결성 규칙

- 새 견적은 버전 1과 함께 `draft` 상태로 생성한다.
- 토큰 발급 시 `draft` 또는 `expired` 견적을 `sent`로 바꾼다. 현재 발송 버전의 토큰을 재발급하면 `sent`를 유지한다.
- 공개 GET은 토큰 시각을 기준으로 만료 여부를 계산하되 DB 상태를 변경하지 않는다.
- 관리자 토큰 작업은 재발급 전에 `expired` 상태를 DB에 반영할 수 있다.
- 만료·취소·교체·사용된 토큰은 승인에 사용할 수 없다.
- 승인 RPC는 토큰·버전·견적 행을 하나의 트랜잭션에서 잠그고 모든 조건을 다시 확인한다. 이후 감사 행 추가, 토큰 사용 처리, 견적의 `approved` 및 `approved_version_id` 설정을 원자적으로 수행한다.
- 견적의 최신 버전에 속한 토큰만 승인할 수 있다.
- `approved` 또는 `cancelled` 견적은 승인을 거부한다. 반복 POST는 일정한 충돌 응답을 반환하며 동시 요청 중 다른 요청의 성공 여부를 노출하지 않는다.
- 새 버전을 만들면 이전 버전의 활성 토큰을 폐기한다. 승인된 견적에서 새 버전을 만들면 과거 승인 감사 기록은 유지하되 `approved_version_id`를 비우고 견적을 `draft`로 되돌린다.
- API 검증과 별개로 DB 제약조건이 금액 합계와 날짜 순서를 강제한다.

## DB 보안

- 네 테이블 모두 RLS를 활성화한다.
- 인증된 관리자는 필요한 범위의 CRUD만 사용할 수 있다. 익명 사용자와 일반 인증 사용자는 테이블에 직접 접근할 수 없다.
- `anon`의 테이블 권한을 회수하고 `authenticated`, `service_role`에는 필요한 권한만 부여한다.
- 공개 접근은 고정된 `search_path`, 명시적 권한, 동적 SQL이 없는 두 개의 `security definer` RPC로 제한한다.
  - 토큰 해시로 허용된 스냅샷 또는 거친 토큰 상태만 반환하는 읽기 전용 조회 RPC
  - 토큰 해시로 승인을 원자 처리하고 승인·충돌·사용 불가 결과만 반환하는 RPC
- 관리자 RPC는 `is_admin()`을 검사하고 `authenticated`, `service_role`에만 실행 권한을 부여한다.
- 오류 응답과 로그에는 토큰 원문, 토큰 해시, 고객 이메일·전화번호, DB 원본 오류를 남기지 않는다.

## API 계약

모든 관리자 API는 기존 관리자 Bearer 토큰 및 세션 검증을 사용한다. 입력은 camelCase, DB payload는 snake_case를 사용한다.

### `POST /api/admin/inquiries`

관리자가 직접 받은 문의를 생성한다. 고객 연락처·회사·사이트 필드, `serviceType`, 선택적 예산과 출시 희망일, 필수 `message`, 선택적 `source`, 관리자 메모를 받는다. `source` 기본값은 `admin_manual`이다. 공개 문의와 동일한 필드 제약을 재사용하지만 익명 삽입 흐름과는 분리한다.

### `POST /api/admin/quotes`

`inquiryId`와 완전한 버전 스냅샷을 받는다. 관리자 RPC 하나가 견적과 버전 1을 원자적으로 생성한다. 생성된 견적과 버전을 반환한다.

### `GET /api/admin/quotes/[id]`

견적, 버전 이력, 해시를 제외한 토큰 메타데이터, 승인 감사 메타데이터를 반환한다. 존재하지 않거나 RLS로 숨겨진 행은 404를 반환한다.

### `POST /api/admin/quotes/[id]/cancel`

취소되지 않은 견적을 원자적으로 `cancelled`로 바꾸고 소유한 모든 활성 토큰을 폐기한다. 반복 호출은 멱등하게 성공한다. 승인된 견적은 감사 기록과 승인 버전 참조를 보존하지만 이후 어떤 토큰도 사용할 수 없다.

### `POST /api/admin/quotes/[id]/versions`

완전한 스냅샷을 받아 RPC로 다음 불변 버전을 생성한다. 기존 버전의 활성 토큰은 폐기한다. 없는 견적은 404, 취소 상태 등 잘못된 상태 전이는 409를 반환한다.

### `POST /api/admin/quote-versions/[id]/approval-token`

서버 런타임에서 고엔트로피 토큰을 만들고 관리자 RPC를 통해 해시만 저장한다. `{ token, expiresAt }`를 한 번만 반환한다. 다시 호출하면 기존 활성 토큰을 폐기하고 새 토큰으로 교체한다.

### `DELETE /api/admin/quote-versions/[id]/approval-token`

활성 토큰을 멱등하게 폐기한다. 활성 토큰이 없어도 성공하며 토큰 관련 비밀값은 반환하지 않는다.

### `GET /api/quotes/[token]`

경로 토큰을 해시한 뒤 읽기 전용 RPC를 호출한다. 유효한 토큰에는 견적 ID, 버전 ID·번호, 고객 표시 이름, 제목, 본문, 작업 범위, 금액, 일정, 결제 조건, 만료 시각만 반환한다. 알 수 없거나 만료·폐기·교체·사용·취소된 토큰에는 고객 정보가 없는 일정한 사용 불가 응답을 반환한다. 상태는 변경하지 않는다.

### `POST /api/quotes/[token]/approve`

토큰을 해시하고 원자적 승인 RPC를 호출한다. 정제하고 길이를 제한한 User-Agent와 신뢰할 수 있는 플랫폼 제공 클라이언트 IP를 선택적으로 기록한다. 성공 시 승인된 견적·버전 ID와 승인 시각을 반환한다. 유효하지 않거나 오래된 토큰은 토큰 해시나 내부 행 상태를 노출하지 않는 일정한 409 또는 410 계열 도메인 오류로 처리한다.

## 검증 및 오류 처리

- DB 호출 전에 Zod로 UUID, 날짜, 금액, 문자열 길이, 전체 작업 범위 배열을 검증한다.
- 금액은 안전한 정수여야 하며 `depositAmount + balanceAmount === totalAmount`를 만족해야 한다.
- 공개 토큰은 해시하기 전에 정확히 32바이트의 base64url 값으로 복호화되는지 확인한다.
- API 응답은 기존 `jsonOk`와 `jsonError` envelope 및 안정적인 도메인 오류 코드를 사용한다.
- 예상 가능한 PostgreSQL/RPC 상태는 400, 404, 409, 410으로 변환한다. 예상하지 못한 실패는 일반화된 500 메시지를 반환한다.
- 라우트는 요청 본문, 인증 헤더, 토큰, 해시, Supabase 원본 오류를 로그에 기록하지 않는다.

## 생성 타입 및 코드 경계

- migration 스키마와 RPC 시그니처에 맞춰 `src/shared/types/database.generated.ts`를 갱신한다.
- 백엔드 소유 영역인 `src/entities/quote` 아래에 견적 스키마와 API 계약을 추가한다.
- 라우트 핸들러는 얇게 유지하고 토큰 생성·해시와 오류 변환은 `src/entities/quote/server` 아래 서버 전용 모듈에 둔다.
- `src/app/(public)`, `src/app/admin`, widgets, UI 컴포넌트, 스타일, 프론트엔드 상태 모델은 수정하지 않는다.

## 테스트

새 동작은 구현 전에 실패하는 테스트를 먼저 작성하는 TDD 방식으로 개발한다.

- 스키마 테스트: 스냅샷 정규화, 잘못된 범위, 금액 불일치, 날짜 순서, 관리자 문의 기본값, 정확한 토큰 형식
- 라우트 테스트: 인증, 안전한 오류 변환, RPC payload, 토큰 원문 1회 반환, 공개 필드 허용 목록, GET의 무변경 보장
- migration 계약 테스트: 테이블, 제약조건, 불변 트리거, RLS, 권한, RPC 보안 선언
- 로컬 Supabase 통합 테스트: 관리자와 익명 사용자의 테이블 접근, 버전 번호와 잠금, 7일 만료, 교체·폐기, 승인 버전 불변성, 새 버전 동작, 최소 공개 조회, 두 동시 승인 중 정확히 하나만 성공
- 전체 검증: lint, type-check, 전체 테스트, production build

통합 테스트는 Supabase URL 호스트가 `127.0.0.1` 또는 `localhost`가 아니면 실행을 거부한다. migration은 로컬 Supabase에만 적용하며 linked 또는 원격 DB에는 push하지 않는다.

## QA 인계

이슈와 PR에 다음 내용을 기록한다.

- 로컬 Supabase 시작·초기화 명령과 통합 테스트 환경변수 플래그
- 관리자 설정 및 수동 문의, 견적, 토큰, 공개 GET, 승인 POST, 재발급, 만료, 취소를 확인하는 API 요청 순서
- 예상 상태 코드와 무결성 조건
- 공개 응답에서 토큰 해시와 연락처 정보가 빠지는지 확인하는 방법
- 원격 migration을 적용하지 않았다는 명시적 확인
