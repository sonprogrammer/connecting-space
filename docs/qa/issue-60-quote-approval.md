# 이슈 #60 견적 버전·승인 백엔드 QA

## 검증 범위

- 관리자 직접 문의 등록
- 견적 및 버전 스냅샷 생성
- 승인된 버전과 승인 감사 이력 잠금
- 7일 승인 토큰 발급·재발급·폐기·만료
- 공개 GET 조회와 명시적 POST 승인 분리
- 동시 승인 요청 중 정확히 한 번만 성공
- 관리자 전용 테이블 RLS와 공개 RPC 최소 권한
- 공개 응답의 연락처·토큰·해시 비노출

이 QA에서는 원격 Supabase에 migration을 적용하지 않는다. `--linked`, `db push`, 원격 DB URL은 사용하지 않는다.

## 1. 임시 로컬 Supabase 준비

저장소에는 특정 개발자의 로컬 포트 설정을 고정하지 않기 위해 `supabase/config.toml`을 추가하지 않았다. 다음처럼 임시 작업 디렉터리를 사용한다.

```bash
mkdir -p /private/tmp/imweb-issue60-qa
supabase init --workdir /private/tmp/imweb-issue60-qa
mkdir -p /private/tmp/imweb-issue60-qa/supabase/migrations
cp supabase/migrations/*.sql /private/tmp/imweb-issue60-qa/supabase/migrations/
supabase start --workdir /private/tmp/imweb-issue60-qa
```

이미 같은 임시 환경을 사용했다면 migration 사본을 갱신한 뒤 로컬 DB만 초기화한다.

```bash
cp supabase/migrations/*.sql /private/tmp/imweb-issue60-qa/supabase/migrations/
supabase db reset --workdir /private/tmp/imweb-issue60-qa
```

명령 출력의 API URL이 `http://127.0.0.1` 또는 `http://localhost`인지 확인한다.

## 2. 자동 통합 테스트

로컬 CLI 환경값을 현재 셸에 불러온 뒤 프로젝트에서 사용하는 이름으로 연결한다. 값 자체는 터미널 로그, 문서, 이슈, PR에 복사하지 않는다.

```bash
eval "$(supabase status --workdir /private/tmp/imweb-issue60-qa -o env 2>/dev/null)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
RUN_QUOTE_INTEGRATION_TESTS=1 npm test
```

테스트는 URL 호스트가 `127.0.0.1` 또는 `localhost`가 아니면 즉시 실패한다.

기대 결과:

- 익명 사용자의 `quotes` 직접 조회: `42501`
- 관리자의 버전 직접 수정: `42501`
- 서비스 역할의 생성된 버전 수정: 불변 트리거로 `55000`
- 토큰 만료 시각: 발급 시각 기준 7일
- 폐기·교체된 토큰의 공개 상태: `unavailable`
- 만료 토큰의 공개 상태: `expired`
- 동시 승인 두 건: `approved` 1건, `unavailable` 1건
- 승인 감사 행: 승인 버전당 1건
- 승인 후 새 버전: 버전 번호 증가, 견적 `draft`, 기존 승인 감사 이력 유지
- 취소 후 승인: `unavailable`

## 3. API 수동 QA 순서

아래 `{ADMIN_ACCESS_TOKEN}`, UUID, `{APP_ORIGIN}`, `{APPROVAL_TOKEN}`은 로컬 실행 환경에서 받은 값을 사용한다. 실제 값은 이슈나 PR에 남기지 않는다.

### 3.1 관리자 직접 문의 등록

```http
POST {APP_ORIGIN}/api/admin/inquiries
Authorization: Bearer {ADMIN_ACCESS_TOKEN}
Content-Type: application/json

{
  "customerName": "로컬 QA 고객",
  "email": "qa@local.test",
  "serviceType": "아임웹 제작",
  "message": "로컬 QA를 위한 관리자 직접 등록 문의입니다.",
  "adminNotes": "원격 DB에 저장하지 않음"
}
```

기대 결과: `201`, `source`는 DB에서 `admin_manual`, 응답에는 생성 ID와 `new` 상태만 포함된다.

### 3.2 견적과 버전 1 생성

```http
POST {APP_ORIGIN}/api/admin/quotes
Authorization: Bearer {ADMIN_ACCESS_TOKEN}
Content-Type: application/json

{
  "inquiryId": "{INQUIRY_ID}",
  "title": "사이트 제작 견적",
  "body": "반응형 사이트 제작과 운영 인계를 포함합니다.",
  "scopeItems": ["기획", "제작", "운영 인계"],
  "totalAmount": 1000000,
  "estimatedStartDate": "2026-09-10",
  "estimatedEndDate": "2026-10-10",
  "depositAmount": 300000,
  "balanceAmount": 700000,
  "depositTerms": "진행 전 입금",
  "balanceTerms": "검수 후 입금"
}
```

기대 결과: `201`, 버전 번호 `1`, 상태 `draft`. 선수금과 잔금의 합계를 다르게 보내면 DB 호출 전 `400`이어야 한다.

### 3.3 승인 토큰 발급과 조회

```http
POST {APP_ORIGIN}/api/admin/quote-versions/{QUOTE_VERSION_ID}/approval-token
Authorization: Bearer {ADMIN_ACCESS_TOKEN}
```

기대 결과: `201`, 43자리 base64url `token`과 7일 후 `expiresAt`. 토큰 원문은 이 응답에서만 확인할 수 있다.

```http
GET {APP_ORIGIN}/api/quotes/{APPROVAL_TOKEN}
```

기대 결과: `200`. 고객 표시 이름과 견적 스냅샷만 포함하며 이메일, 전화번호, `token_hash`, 관리자 메모는 없어야 한다. GET 전후 견적 상태와 승인 감사 행 개수는 같아야 한다.

### 3.4 명시적 승인과 동시성

```http
POST {APP_ORIGIN}/api/quotes/{APPROVAL_TOKEN}/approve
```

같은 요청을 동시에 두 번 보낸다. 기대 결과는 성공 `200` 한 건과 `QUOTE_APPROVAL_UNAVAILABLE` 충돌 `409` 한 건이다. `quote_approvals`에는 한 행만 생겨야 한다.

### 3.5 재발급·폐기·만료·취소

- 같은 버전에 토큰을 다시 발급하면 이전 토큰 GET은 `404`, 새 토큰 GET은 `200`이어야 한다.
- `DELETE /api/admin/quote-versions/{ID}/approval-token` 이후 토큰 GET은 `404`여야 한다. DELETE를 반복해도 `200`이어야 한다.
- 로컬 DB에서 토큰의 생성·만료 시각을 함께 과거로 옮긴 뒤 GET은 `410`, 승인 POST도 `410`이어야 한다.
- `POST /api/admin/quotes/{ID}/cancel` 후 활성 토큰 승인은 `409`여야 한다. 취소를 반복해도 `200`이어야 한다.
- 승인 후 `POST /api/admin/quotes/{ID}/versions`로 새 스냅샷을 보내면 다음 버전이 생성되고 상태는 `draft`가 되어야 한다. 과거 버전과 승인 감사 행은 그대로 유지되어야 한다.

## 4. 전체 정적 검증

```bash
npm run lint
npm run type-check
npm test
npm run build
git diff --check
```

모든 명령이 성공해야 한다. 통합 테스트는 기본 전체 테스트에서 건너뛰며, 2절의 로컬 환경 플래그를 설정한 경우에만 실제 DB를 사용한다.

## 5. 원격 DB 미적용 확인

- `supabase db push`, `supabase link`, `--linked` 명령을 실행하지 않는다.
- PR에는 migration SQL만 포함하며 적용 여부는 QA와 Planner 승인 뒤 별도 절차로 결정한다.
- 이 구현 세션에서는 원격 DB migration을 적용하지 않았다.
