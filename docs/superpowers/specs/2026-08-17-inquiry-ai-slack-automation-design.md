# 문의 AI 답변 초안 및 Slack 알림 자동화 설계

기준일: 2026-08-17

## 목표

공개 사이트에 제작 문의가 등록되면 문의 접수는 즉시 완료하고, 서버가 문의 내용과 관리자가 관리하는 서비스·가격·일정·FAQ 정보를 바탕으로 AI 답변 초안을 생성한다. 초안은 관리자 문의 상세 화면에 영구 저장한 뒤 Slack으로 알린다.

AI나 Slack에 장애가 생겨도 고객의 문의 접수는 실패하지 않아야 한다. 자동 처리는 DB 작업 큐에 기록하고 재시도하며, 최종 실패 시 관리자가 화면에서 원인과 상태를 확인하고 수동으로 재실행할 수 있어야 한다.

이번 기능은 손영진 대표의 아임웹 홈페이지 제작 대행 업무를 보조하는 내부 운영 기능이다. 고객에게 답변을 자동 발송하지 않는다.

## 확정된 운영 원칙

- 최초 입력 채널은 공개 사이트 제작 문의 폼만 지원한다.
- 최초 알림 채널은 Slack만 지원한다. 이메일과 카카오톡은 후속 범위다.
- AI 결과는 관리자 문의 상세 화면에 먼저 저장한 후 Slack 알림을 보낸다.
- AI는 DB에 등록된 확실한 서비스 정보만 사용한다.
- 가격, 일정, 작업 범위처럼 확정할 근거가 부족한 내용은 단정하지 않고 `확인 필요 사항`으로 분리한다.
- 관리자는 답변 초안을 조회, 편집·저장, 재생성, 복사할 수 있다.
- Slack 실패는 자동으로 최대 3회 시도하며, 이후에는 관리자 화면에서 수동 재전송한다.
- Slack에는 고객 이름, 문의 요약, 예산·희망 일정, 답변 초안, 확인 필요 사항, 관리자 상세 링크만 포함한다.
- 고객 이메일, 전화번호, 문의 원문 전체는 Slack으로 보내지 않는다.

## 선택한 접근 방식

DB 작업 큐와 아웃박스를 사용한다.

동기 방식처럼 AI와 Slack이 끝날 때까지 고객 요청을 붙잡지 않고, Make·Zapier·n8n 같은 외부 자동화 도구에도 핵심 흐름을 의존하지 않는다. 문의와 작업을 같은 서버 흐름에서 DB에 기록한 후 별도 처리기가 AI 생성과 Slack 전송을 단계별로 수행한다.

첫 처리 속도를 높이기 위해 Next.js 16의 `after()`에서 문의 응답 반환 후 작업 처리를 시도한다. 작업 상태는 항상 DB에 남기므로 이 실행이 중단돼도 예약 복구 엔드포인트나 관리자 수동 재시도로 이어갈 수 있다.

## 전체 흐름

```text
고객 문의 제출
  -> DB 함수로 inquiries + AI 생성 작업을 한 트랜잭션에 저장
  -> 고객에게 201 즉시 반환
  -> after()에서 처리기 호출
      -> 공개된 서비스/가격/FAQ 조회
      -> 설정된 AI 공급자로 구조화된 답변 생성
      -> 현재 초안 + 생성 이력 저장
      -> Slack 전송 작업 생성 및 실행
      -> 성공 상태 저장

실패
  -> 오류와 시도 횟수 저장
  -> 다음 실행 시각 이후 재시도
  -> 총 3회 실패 시 failed
  -> 관리자 화면에서 오류 확인 및 수동 재실행
```

## 데이터 모델

기존 `inquiries`, `admins`, `ai_generation_records`를 유지하고 다음 구조를 마이그레이션으로 추가한다.

### `service_offerings`

공개 가격 영역과 AI가 함께 사용하는 단일 원본이다.

- `id`, `slug`, `name`, `description`
- `price_label`: 화면에 표시할 가격 문구
- `price_min`, `price_max`: 비교·추론에 사용할 선택 숫자 범위
- `duration_label`: 화면에 표시할 예상 기간
- `included_items`, `excluded_items`: JSON 문자열 배열
- `ai_guidance`: 공개 화면에는 표시하지 않는 내부 답변 지침
- `is_published`, `sort_order`, `created_at`, `updated_at`

가격이나 일정이 확정값이 아니라면 표시 문구도 범위 또는 `상담 후 확정`으로 저장한다. AI는 숫자 필드가 없거나 문의 조건이 범위를 벗어나면 확정 금액을 만들지 않는다.

### `faq_items`

공개 FAQ와 AI가 함께 사용하는 단일 원본이다.

- `id`, `question`, `answer`
- `ai_guidance`: 예외나 내부 확인 기준
- `is_published`, `sort_order`, `created_at`, `updated_at`

### `inquiry_reply_drafts`

문의별 현재 편집본을 저장한다. 생성 이력은 기존 `ai_generation_records`에 별도로 남긴다.

- `id`, `inquiry_id`(unique), `generation_record_id`
- `summary`, `draft_text`
- `needs_confirmation`: 확인 필요 사항 JSON 배열
- `status`: `generating`, `ready`, `failed`
- `last_error`, `created_at`, `updated_at`, `updated_by`

재생성하면 `ai_generation_records`에 새 이력을 추가하고, 관리자가 보는 현재 초안만 새 결과로 갱신한다. 관리자가 직접 편집한 저장본은 자동으로 Slack에 재전송하지 않는다.

### `automation_jobs`

AI 생성과 Slack 전송을 복구 가능한 단계로 관리한다.

- `id`, `inquiry_id`
- `job_type`: `generate_inquiry_reply`, `send_slack_notification`
- `status`: `pending`, `processing`, `retry`, `completed`, `failed`
- `payload`: 필요한 식별자만 담는 JSON
- `attempt_count`, `max_attempts`(기본 3)
- `available_at`, `locked_at`, `locked_by`
- `last_error`, `completed_at`, `created_at`, `updated_at`

동일 문의에 같은 종류의 활성 작업이 중복 생성되지 않도록 부분 unique 인덱스를 둔다. 처리기는 잠금 만료 조건을 적용해 중단된 `processing` 작업을 회수할 수 있어야 한다.

### `notification_deliveries`

Slack 전송 결과를 운영 기록으로 남긴다.

- `id`, `inquiry_id`, `draft_id`
- `channel`: 최초 범위에서는 `slack`
- `status`, `attempt_count`, `last_error`, `sent_at`
- `created_at`, `updated_at`

Webhook URL과 AI API 키는 DB와 Git에 저장하지 않고 서버 환경변수로만 관리한다.

## RLS와 권한

- `service_offerings`, `faq_items`: 익명 클라이언트의 테이블 직접 접근은 허용하지 않는다. 공개 Route Handler가 `is_published = true` 행에서 허용 필드만 골라 반환하며 관리자는 전체 CRUD가 가능하다.
- `inquiry_reply_drafts`, `ai_generation_records`, `notification_deliveries`: 관리자만 조회·관리한다.
- `automation_jobs`: 브라우저에서 직접 접근하지 않는다. 서버의 service role 처리기만 읽고 변경한다.
- 공개 응답에는 `ai_guidance`, 내부 오류, 프롬프트, 고객 개인정보를 포함하지 않는다.
- 관리자 Route Handler는 기존 `getVerifiedAdminSupabase()` 인증 방식을 따른다.

## AI 생성 규칙

서버는 문의, 공개된 서비스 정보, 공개된 FAQ를 입력으로 조합한다. AI 공급자 응답은 다음 구조를 강제한다.

```ts
type InquiryReplyResult = {
  summary: string;
  draft: string;
  needsConfirmation: Array<{
    topic: string;
    reason: string;
    suggestedQuestion: string;
  }>;
};
```

프롬프트에는 다음 금지 규칙을 코드와 함께 둔다.

- DB 근거가 없는 가격, 할인, 제작 기간, 제공 범위를 새로 만들지 않는다.
- 고객이 적은 희망 일정과 실제 가능 일정을 같은 것으로 취급하지 않는다.
- 법률, 세무, 결제 확정처럼 관리자가 승인해야 하는 표현을 확정하지 않는다.
- 불명확하거나 충돌하는 정보는 본문에서 단정하지 않고 `needsConfirmation`으로 보낸다.
- 고객에게 바로 보낼 수 있는 정중한 한국어 초안으로 작성하되 최종 발송 책임은 관리자에게 있음을 전제로 한다.

구조 검증 실패나 API 오류도 생성 기록과 작업 오류에 남긴다. 원문 프롬프트를 저장할 때 비밀키는 포함하지 않는다.

공급자 연동은 OpenAI 호환 Chat Completions 계약으로 캡슐화한다. 기본 예시는 기존 설계와 같은 OpenAI이며 `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`만 바꿔 Groq 또는 Gemini로 전환할 수 있다. 기타 호환 공급자는 `AI_PROVIDER=custom`과 `AI_BASE_URL`을 사용한다.

## API 설계

### 공개 문의 등록

`POST /api/inquiries`

- 기존 입력 검증을 유지한다.
- service role만 실행할 수 있는 DB 함수로 문의와 `generate_inquiry_reply` 작업을 한 트랜잭션에 생성한다.
- AI·Slack 완료를 기다리지 않고 `201`을 반환한다.
- DB 트랜잭션이 성공하면 문의와 최초 작업이 반드시 함께 존재한다. AI 공급자 또는 Slack 실행 실패는 이 트랜잭션과 문의 응답에 영향을 주지 않는다.
- 응답 직후 `after()`로 해당 작업의 첫 처리를 시도한다.

### 공개 가격·FAQ 조회

- `GET /api/service-offerings`
- `GET /api/faqs`

게시된 행만 정렬해 공개 필드로 반환한다. 공개 홈은 하드코딩 배열 대신 이 API를 사용한다.

### 관리자 콘텐츠 관리

- `GET/POST /api/admin/service-offerings`
- `GET/PATCH /api/admin/service-offerings/[id]`
- `GET/POST /api/admin/faqs`
- `GET/PATCH /api/admin/faqs/[id]`

삭제 대신 `isPublished`로 공개 여부를 관리한다.

### 관리자 문의 초안

- `GET /api/admin/inquiries/[id]/reply-draft`
- `PATCH /api/admin/inquiries/[id]/reply-draft`
- `POST /api/admin/inquiries/[id]/reply-draft/regenerate`
- `POST /api/admin/inquiries/[id]/notifications/slack/retry`

재생성과 Slack 재전송은 활성 중복 작업을 만들지 않는다. 관리자가 편집한 초안은 PATCH로 저장하며 복사는 브라우저에서 처리한다.

### 작업 복구

`POST /api/internal/automation/process`

- 배포 환경의 예약 호출 또는 운영자가 지정한 서버 호출만 허용한다.
- 별도 secret 헤더를 검증한다.
- 실행 가능한 작업을 제한된 개수만 가져와 잠근 뒤 처리한다.
- 로컬 개발에서는 명시적 수동 호출로 검증할 수 있다.

예약 실행 설정은 배포 단계에서 확정한다. 애플리케이션 코드는 특정 호스팅 업체에 종속되지 않는 내부 엔드포인트 계약을 유지한다.

## Slack 메시지

메시지는 한눈에 판단할 수 있는 순서로 구성한다.

1. 새 제작 문의 제목과 관리자 상세 링크
2. 고객 이름, 서비스 유형, 예산 범위, 희망 오픈일
3. AI 문의 요약
4. 답변 초안
5. `확인 필요 사항` 목록
6. 자동 생성 초안이며 발송 전 검토가 필요하다는 안내

Slack Incoming Webhook의 HTTP 상태를 검사하고 응답 본문 전체나 Webhook URL을 로그에 남기지 않는다.

## 관리자 화면

문의 상세 화면에 `AI 답변 초안` 영역을 추가한다.

- 생성 대기·생성 중·완료·실패 상태
- 편집 가능한 답변 본문
- 별도로 강조된 확인 필요 사항
- 저장, 복사, 재생성 버튼
- 마지막 생성 시각과 사용 모델
- Slack 전송 성공·재시도 중·최종 실패 상태
- 실패 원인 요약과 Slack 수동 재전송 버튼

서비스·가격·일정과 FAQ를 관리하는 영역도 `/admin`에 추가한다. 공개 홈과 AI는 같은 데이터를 사용하므로 관리자가 한 번 수정하면 둘 다 반영된다.

## 오류 및 재시도

- 문의 접수 성공 여부와 후속 자동화 성공 여부를 분리한다.
- 작업 실패 시 `attempt_count`를 올리고 `available_at`을 뒤로 미룬다.
- 최대 3회까지 지수형 간격으로 재시도한다.
- AI 최종 실패 시 초안 상태를 `failed`로 표시하고 재생성 버튼을 제공한다.
- Slack 최종 실패 시 저장된 초안은 유지하고 수동 재전송 버튼을 제공한다.
- 한 작업을 여러 실행기가 동시에 가져가도 중복 처리되지 않도록 DB 잠금과 멱등성 검사를 사용한다.
- 오류 메시지에는 AI API 키, Supabase service role key, Slack Webhook URL, 고객 연락처를 넣지 않는다.

## 테스트와 검증

Back PR에서 확인한다.

- 문의와 최초 작업 생성, 문의 응답이 AI 완료를 기다리지 않음
- 작업 claim, 잠금 만료 회수, 중복 방지, 완료와 3회 실패 전이
- AI 구조 응답 검증과 확인 필요 사항 분리
- 공개 가격·FAQ와 관리자 CRUD의 인증·RLS·필드 제한
- 초안 저장, 재생성, Slack 수동 재전송 API
- Slack 성공·실패·재시도와 비밀/개인정보 로그 미노출
- 단위 테스트, lint, type-check, production build

Front PR에서 확인한다.

- 공개 홈 가격·FAQ가 API 데이터로 표시됨
- 관리자 서비스·FAQ 수정 및 공개 상태 관리
- 문의 상세의 초안 상태, 편집·저장·복사·재생성
- 확인 필요 사항과 Slack 상태·수동 재전송 표시
- 로딩, 빈 상태, API 실패, 권한 만료, 모바일·데스크톱 반응형
- 단위 테스트, lint, type-check, production build

최종 QA에서 확인한다.

- 실제 문의 등록부터 AI 초안 DB 저장, 관리자 표시, Slack 수신까지 전체 흐름
- AI 공급자 장애와 Slack 장애를 각각 모의한 재시도 및 최종 실패 표시
- 같은 작업의 중복 초안·중복 Slack 알림 방지
- 가격·FAQ를 관리 화면에서 바꾸면 공개 홈과 이후 AI 답변에 함께 반영됨
- Slack에 이메일·전화번호·문의 원문 전체가 포함되지 않음
- 관리자 외 사용자가 내부 초안·작업·알림 데이터에 접근하지 못함

## 구현 및 PR 순서

1. Back: 마이그레이션, 데이터 계약, 공개/관리자 API, 작업 처리기, 공급자 중립 AI·Slack 연동, 테스트를 구현한다.
2. QA: Back PR의 스키마, RLS, 작업 상태 전이, 실패 복구, 개인정보 제한을 검증한다.
3. Planner: Back PR을 검토하고 통과 시 병합한다.
4. Front: 병합된 API 계약을 기준으로 공개 가격·FAQ와 관리자 관리/초안 UI를 구현한다.
5. QA: Front PR의 사용자 흐름, 상태, 반응형, 실제 연동 회귀를 검증한다.
6. Planner: Front PR을 검토하고 통과 시 병합한다.
7. Planner/운영자: Supabase 마이그레이션과 운영 환경변수를 적용하고 최종 배포 QA를 진행한다.

Back과 Front가 API 계약 파일이나 같은 조립 파일을 동시에 수정하지 않도록 순차 진행한다.

## 환경변수

- 기존 Supabase 공개 URL/anon key/service role key
- `AI_PROVIDER`: `groq`, `gemini`, `openai`, `custom` 중 하나
- `AI_API_KEY`
- `AI_MODEL`
- `AI_BASE_URL`: `custom` 공급자에서만 필수
- `SLACK_INQUIRY_WEBHOOK_URL`
- `AUTOMATION_PROCESS_SECRET`
- `ADMIN_BASE_URL`: Slack 관리자 상세 링크 생성용 운영 URL

환경변수 값은 문서, 이슈, 커밋, 로그에 기록하지 않는다.

## 제외 범위와 다음 단계

이번 범위에서 제외한다.

- 고객에게 이메일·카카오톡·문자 자동 발송
- 이메일로 들어온 문의 자동 수집
- Slack 이외 채널 알림
- AI 제안서, 계약서, 아임웹 코드 생성
- AI가 가격이나 일정을 자동 승인하는 기능
- 답변 초안 자동 고객 발송

후속 순서는 다음과 같다.

1. 이메일 알림 채널 추가
2. 이메일 문의 수집 및 중복 문의 연결
3. 카카오톡 알림 또는 발송 연동 검토
4. 제안서 초안 생성
5. 계약서 초안 생성
6. 아임웹 코드 생성 및 저장

## 완료 기준

- 고객은 AI나 Slack 상태와 무관하게 문의를 정상 등록할 수 있다.
- 문의마다 현재 AI 답변 초안과 확인 필요 사항을 관리자 화면에서 확인할 수 있다.
- 서비스·가격·기간·FAQ는 DB에서 수정 가능하며 공개 홈과 AI가 같은 원본을 사용한다.
- AI는 근거 없는 가격·일정·범위를 확정하지 않는다.
- 초안 저장 후 Slack 알림이 전송되고 실패 시 최대 3회 재시도된다.
- 최종 실패가 관리자 화면에 나타나며 수동 재생성·재전송이 가능하다.
- Slack과 로그에 지정하지 않은 고객 개인정보와 비밀값이 노출되지 않는다.
- 마이그레이션, RLS, 테스트, production build, 실제 전체 흐름 QA가 통과한다.
