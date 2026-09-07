# 견적 이메일 발송·만료 알림 백엔드 설계

## 배경과 목표

이 문서는 이슈 #62의 구현 설계를 정의한다. 관리자가 견적 버전 발송을 요청하면 승인 토큰 발급과 내구성 있는 이메일 작업 생성을 하나의 DB 트랜잭션으로 처리하고, Resend 발송 성공 뒤에만 견적을 `sent`로 전환한다. 실패 재시도, 중복 요청, 만료 후 재발급, 만료 하루 전 관리자 Slack 알림을 모두 멱등하게 처리한다.

이 설계는 이슈 #60의 견적·버전·승인 토큰·공개 승인 API를 확장한다. 원격 Supabase에는 migration을 적용하지 않으며 로컬 Supabase에서만 검증한다. 프론트엔드는 수정하지 않는다.

## 확정된 선택

기존 문의 AI/Slack용 `automation_jobs`는 `(inquiry_id, job_type)` 중심이고 견적 발송 generation의 수명주기와 맞지 않는다. 따라서 견적 이메일과 만료 Slack 알림은 전용 작업 테이블과 claim/finalize RPC를 사용한다. 기존 GitHub Actions cron과 내부 processing API는 호출 진입점만 공유한다.

Resend SDK 의존성은 추가하지 않고 공식 HTTP API를 얇은 공통 provider 모듈로 감싼다. 이 모듈은 향후 이슈 #45의 관리자 이메일 알림에서도 재사용할 수 있도록 견적 도메인 타입을 알지 못한다.

## 데이터 모델

### `quote_email_deliveries`

견적 승인 이메일의 발송 generation과 작업 상태를 함께 보존한다.

- `id uuid`: 애플리케이션이 미리 생성하는 작업 ID이자 Resend idempotency key의 안정적인 구성 요소
- `quote_id uuid`, `quote_version_id uuid`, `approval_token_id uuid`: 발송 대상과 토큰
- `generation integer`: 같은 견적 버전의 발송 세대, 1부터 증가
- `status`: `queued`, `processing`, `retry`, `sent`, `failed`
- `encrypted_payload text`, `payload_nonce text`, `payload_auth_tag text`: AES-256-GCM 암호문과 nonce, 인증 태그
- `attempt_count`, `max_attempts`, `available_at`, `locked_at`, `locked_by`: claim과 지수 백오프용 필드
- `provider_message_id text`: Resend 성공 응답의 메시지 ID
- `error_code text`: 개인정보나 provider 원문을 포함하지 않는 정제된 오류 코드
- `sent_at`, `completed_at`, `superseded_at`, `created_at`, `updated_at`

`quote_version_id + generation`은 유일하다. `superseded_at is null`인 작업은 버전당 하나만 허용하는 부분 unique 인덱스로 동시 `/send` 요청을 직렬화한다. `sent` 작업도 토큰이 유효한 동안 현재 generation으로 유지한다. 만료·폐기·사용된 토큰의 작업은 lifecycle RPC가 `superseded_at`을 기록하며 이후 `/send`가 같은 버전에 다음 generation을 만들 수 있다. 최종 `failed` 작업은 자동으로 supersede하지 않으므로 `/send`가 새 메일을 만들지 않고 수동 retry를 요구한다.

암호화 payload에는 다음 고정 스냅샷을 넣는다.

- 수신 이메일
- 고객 표시 이름
- 견적 제목, 본문, 작업 범위, 금액, 일정, 결제 조건
- 승인 토큰 원문

토큰 원문, 승인 URL, 수신 이메일, 메일 본문은 어느 DB 컬럼에도 평문으로 저장하지 않는다.

비동기 발송용 토큰은 enqueue 시 `quote_approval_tokens.expires_at = null`로 생성한다. 후속 migration은 해당 컬럼의 `not null`을 제거하며, 공개 조회·승인 RPC는 견적이 `sent`이고 `expires_at`이 존재할 때만 토큰을 사용할 수 있도록 강화한다. 따라서 발송 전 토큰은 원문이 노출되는 비정상 상황에서도 승인에 사용할 수 없다. 기존 수동 토큰 발급 RPC는 7일 만료 시각을 계속 만들되 견적 상태를 바꾸지 않는다.

### `quote_expiration_alerts`

만료 하루 전 관리자 Slack 알림을 토큰당 한 번만 처리한다.

- `id uuid`, `quote_id`, `quote_version_id`, `approval_token_id`
- `status`, `attempt_count`, `max_attempts`, `available_at`, lock 필드
- `error_code`, `sent_at`, `completed_at`, 생성·수정 시각
- `approval_token_id` unique 제약으로 한 토큰당 한 작업만 생성

Slack 메시지는 처리 시점에 견적 식별자, 버전 번호, 만료 시각만 조회해 구성한다. 고객 이메일이나 본문은 포함하지 않는다.

두 테이블 모두 RLS를 활성화하고 관리자에게 읽기만 허용한다. 쓰기와 RPC 실행은 service role로 제한한다.

## 암호화 경계

`QUOTE_EMAIL_ENCRYPTION_KEY`는 정확히 32바이트인 base64 문자열이다. Node `crypto`의 AES-256-GCM을 사용하며 매 암호화마다 12바이트 랜덤 nonce를 생성한다.

AAD는 다음 값을 길이 구분이 있는 고정 JSON 배열로 직렬화한다.

```text
["quote-email-v1", jobId, quoteVersionId, approvalTokenId]
```

복호화 시 DB 행의 ID들을 다시 AAD로 구성한다. 작업·버전·토큰 사이에서 ciphertext를 교체하면 인증 태그 검증이 실패한다. 키, 평문, 승인 URL은 로그나 오류에 포함하지 않는다.

공개 승인 URL은 신뢰된 `QUOTE_PUBLIC_BASE_URL` 환경변수의 origin과 복호화한 토큰으로만 만든다. 요청의 Host 또는 forwarded 헤더는 사용하지 않는다.

## `/send` API와 트랜잭션

### `POST /api/admin/quote-versions/[id]/send`

1. 관리자 인증과 UUID를 검증한다.
2. 견적·버전·문의를 읽고 최신 버전인지, 취소·승인 상태가 아닌지, 문의 이메일이 유효한지 확인한다. 이메일이 없거나 유효하지 않으면 토큰 생성 전에 `400 QUOTE_RECIPIENT_EMAIL_REQUIRED`를 반환한다.
3. 작업 ID, 토큰 ID, 32바이트 base64url 토큰을 생성한다.
4. 고정 메일 payload를 AES-256-GCM으로 암호화하고 토큰 SHA-256 해시를 만든다.
5. `enqueue_quote_email_delivery` RPC에 ID, 해시, 암호문 구성 요소를 전달한다.
6. RPC는 견적 행을 잠근 뒤 아래를 한 트랜잭션으로 수행한다.
   - 현재 작업이 `queued|processing|retry|sent`이고 토큰이 유효하면 기존 작업을 반환한다.
   - 현재 작업이 `failed`이고 토큰이 유효하면 `retry_required`를 반환한다.
   - 토큰이 만료·폐기·사용됐으면 기존 작업을 supersede하고 기존 토큰을 폐기한다.
   - `expires_at = null`인 새 토큰을 삽입하고 다음 generation의 `queued` 작업을 삽입한다.
   - enqueue 단계에서는 견적 상태를 변경하지 않는다.
7. 새 작업은 `202`, 기존 활성 또는 sent 작업의 멱등 응답은 `200`, 최종 실패 작업은 `409 QUOTE_EMAIL_RETRY_REQUIRED`로 반환한다.

응답에는 작업 ID, 견적/버전 ID, generation, 상태, 시도 횟수, 다음 시도 시각, 발송 시각, 링크 만료 시각, 정제된 오류 코드, 만료 임박 Slack 상태만 포함한다. 토큰과 URL은 반환하지 않는다.

## 발송 worker와 Resend 멱등성

기존 내부 automation processing 요청은 기존 문의 작업 처리와 별도로 아래를 수행한다.

1. `schedule_quote_lifecycle` RPC로 만료 상태와 임박 Slack 작업을 준비한다.
2. `claim_quote_email_deliveries`로 발송 작업을 claim한다.
3. 각 행의 AAD를 재구성해 payload를 복호화한다.
4. HTML/text 메일을 동일한 고정 payload에서 렌더링한다.
5. `POST https://api.resend.com/emails`를 호출한다.

요청 헤더의 `Idempotency-Key`는 `quote-approval/{jobId}`로 고정한다. Resend의 provider idempotency 보관 기간은 24시간이므로 자동 retry는 최대 3회와 짧은 지수 백오프 안에서 끝낸다. 애플리케이션 DB의 현재 generation 제약이 24시간 이후의 중복 `/send`도 차단한다.

Resend 성공 후 `finalize_quote_email_delivery` RPC가 한 트랜잭션에서 다음을 처리한다.

- 작업 `sent`, provider message ID, `sent_at`, `completed_at`
- 견적 `sent`
- 토큰 `expires_at = sent_at + interval '7 days'`

Resend 성공 뒤 finalize DB 호출만 실패하면 작업 lock이 만료된 후 같은 작업을 다시 claim한다. worker는 같은 암호화 payload와 같은 idempotency key로 Resend를 재호출해 기존 provider message ID를 회수한 뒤 finalize한다. 이 장애 경로를 테스트한다.

provider 오류나 암호화 오류는 정제된 코드만 저장한다. 재시도 가능 오류는 `retry`와 다음 시각을 기록한다. 최대 시도에 도달하면 `failed`로 끝내되 견적은 `draft`로 유지한다.

## 수동 retry와 재발급

### `POST /api/admin/quote-email-jobs/[id]/retry`

- `failed` 작업의 토큰이 아직 유효하고 폐기·사용되지 않았으면 같은 작업을 `queued`로 되돌리고 시도 횟수를 0으로 초기화한다. 응답은 `202`다.
- 이미 `queued|processing|retry`이면 상태를 변경하지 않고 `200`으로 같은 작업을 반환한다.
- 이미 `sent`이면 `200`으로 같은 결과를 반환한다.
- 토큰이 만료·폐기·사용됐거나 견적이 승인·취소됐으면 `409 QUOTE_EMAIL_REISSUE_REQUIRED` 또는 `409 QUOTE_EMAIL_UNAVAILABLE`을 반환한다.
- retry는 작업 ID, 토큰, 암호문, idempotency key를 바꾸지 않는다.

만료·폐기된 토큰은 retry하지 않는다. 관리자는 동일한 `/send` API를 다시 호출해 같은 견적 버전에 새 토큰과 다음 generation 작업을 만든다. 견적 내용이 바뀔 때만 새 견적 버전을 만든다.

## 만료 처리와 Slack 알림

`schedule_quote_lifecycle(p_now)` RPC는 cron마다 실행하며 다음을 원자적으로 처리한다.

- `sent` 견적의 활성 토큰이 `p_now` 이하로 만료되면 견적을 `expired`로 바꾸고 토큰을 폐기하고 현재 이메일 작업을 supersede한다.
- 만료까지 24시간 이하로 남은 `sent` 견적만 `quote_expiration_alerts`에 삽입한다.
- 승인·취소·만료 상태이거나 폐기·교체·사용된 토큰은 제외한다.
- unique 제약과 `on conflict do nothing`으로 토큰당 Slack 작업을 한 번만 만든다.

Slack worker는 기존 webhook provider를 재사용하고 관리자 견적 상세 경로를 포함한다. 고객에게 만료 재촉 이메일은 생성하지 않는다.

## 기존 #60 동작과의 호환

후속 migration에서 `issue_quote_approval_token`을 교체해 토큰 발급만 수행하고 견적을 즉시 `sent`로 바꾸는 update를 제거한다. 기존 `/approval-token` API의 토큰 발급 기능은 유지하지만 상태는 발송 성공 전까지 `draft`다. #62의 `/send` 경로만 암호화된 비동기 발송 작업을 함께 만든다. 공개 조회·승인 RPC는 `quote.status = 'sent'`와 non-null `expires_at`을 추가로 요구한다.

새 견적 버전 생성, 견적 취소, 공개 승인 RPC는 활성 토큰 폐기와 함께 현재 이메일 작업도 supersede하도록 후속 migration에서 보강한다. worker도 발송 직전 토큰·견적 유효성을 확인해 이미 무효가 된 작업은 provider를 호출하지 않는다.

## 관리자 API 계약

견적 상세 응답에 `emailDeliveries`와 활성 토큰별 `expirationAlert` 상태를 추가한다. 프론트엔드 구현은 하지 않는다.

공통 작업 응답은 다음 필드를 사용한다.

```text
jobId
quoteId
quoteVersionId
approvalTokenId
generation
status
attemptCount
maxAttempts
nextAttemptAt
sentAt
expiresAt
errorCode
expirationAlertStatus
```

암호화 컬럼, 잠금 정보, provider message ID, 수신자 정보는 API 응답에서 제외한다.

## 환경변수

- `RESEND_API_KEY`: Resend 서버 API 키
- `RESEND_FROM_EMAIL`: 인증된 발신 주소
- `QUOTE_EMAIL_ENCRYPTION_KEY`: 32바이트 base64 AES 키
- `QUOTE_PUBLIC_BASE_URL`: 고객이 여는 공개 사이트 origin
- 기존 `SLACK_INQUIRY_WEBHOOK_URL`, `ADMIN_BASE_URL`, `AUTOMATION_PROCESS_SECRET`

`.env.example`에는 이름과 비밀이 아닌 형식 설명만 추가한다. 실제 값과 실제 수신자 정보는 이슈, PR, 테스트 fixture, 로그에 기록하지 않는다.

## 테스트 전략

TDD로 아래 동작을 먼저 실패시키고 최소 구현으로 통과시킨다.

- migration 정적 계약: 테이블, RLS, 부분 unique, claim/enqueue/finalize/retry/lifecycle RPC와 권한
- 로컬 PostgreSQL 통합: 동시 enqueue 멱등성, generation 증가, 실패 retry, 만료 후 재발급, 성공 후에만 `sent`, 성공 시각 기준 7일 만료, 만료 처리, Slack 작업 1회 생성, 무효 토큰 제외
- 암호화: 정상 round-trip, 랜덤 nonce, 잘못된 키·태그·AAD와 행 교체 탐지
- 이메일 renderer: 고객명, 견적 요약, 만료일, 승인 링크가 HTML/text에 포함되고 안전하게 escape됨
- Resend provider: 고정 idempotency header, 성공 ID 파싱, 오류 본문·주소·키 비노출
- `/send`: 인증, 이메일 없음, 신규 202, 중복 200, 실패 409, 응답 비밀값 미포함
- retry API: 동일 작업 재활성화, 활성/sent 멱등 응답, 만료·폐기·승인·취소 충돌
- worker: 성공, 재시도, 최종 실패, 성공 후 finalize 실패 뒤 동일 Resend 요청 회수, 무효 토큰 provider 호출 차단
- lifecycle: 만료 하루 전 Slack 한 번, 고객 이메일 없음, 만료 상태 및 토큰 폐기
- 회귀 검증: lint, type-check, 전체 테스트, production build

## 배포와 QA 경계

새 migration은 로컬 Supabase에서만 적용하고 통합 테스트한다. 원격 migration 목록 조회나 `db push --linked`를 실행하지 않는다. PR에는 필요한 환경변수 이름과 QA 절차만 기록하고 비밀값은 포함하지 않는다.
