# 이슈 #67 견적 PDF 수동 발급 QA

## 전제

- 이 기능 PR의 migration은 원격 Supabase에 적용하지 않는다.
- 로컬 Supabase URL의 host가 `127.0.0.1` 또는 `localhost`인지 확인한다.
- `QUOTE_PUBLIC_BASE_URL`에는 고객용 견적 화면의 신뢰된 origin을 설정한다.
- `QUOTE_MANUAL_DELIVERY_TOKEN_KEY`에는 base64로 인코딩한 32바이트 전용 키를 설정한다.
- Resend 관련 환경변수는 제거한 상태로 검증한다.

로컬 전용 키 예시 생성:

```bash
openssl rand -base64 32
```

## 자동 검증

로컬 Supabase를 시작하고 migration을 처음부터 적용한다.

```bash
supabase start
supabase db reset
supabase status -o env
```

`supabase status -o env`의 로컬 값을 설정한 뒤 다음을 실행한다.

```bash
RUN_QUOTE_INTEGRATION_TESTS=1 \
RUN_QUOTE_MANUAL_INTEGRATION_TESTS=1 \
./node_modules/.bin/tsc -p tsconfig.test.json
node --test --test-concurrency=1 .test-dist/tests/*.test.js

# 단위·계약 테스트만 빠르게 확인할 때
npm test
npm run lint
npm run type-check
npm run build
```

## API QA 순서

아래 예시의 실제 관리자 access token, 최신 견적 버전 UUID, 로컬 API origin을 사용한다. 값은 이슈·PR·로그에 남기지 않는다.

1. UUID v4 멱등 키를 한 번 생성해 같은 발급 시도 동안 재사용한다.
2. 신규 수동 PDF를 발급한다.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"<IDEMPOTENCY_UUID>"}' \
  -D quote-headers.txt \
  -o quote.pdf \
  http://127.0.0.1:3000/api/admin/quote-versions/<QUOTE_VERSION_ID>/manual-delivery
```

예상 결과:

- HTTP 201, `Content-Type: application/pdf`, attachment 파일명
- `X-Quote-Manual-Delivery-Id`, `X-Quote-Expires-At` 헤더
- 견적 상태 `sent`, 발송 방식 `manual`, 발급 시각부터 정확히 7일 만료
- 이메일 작업은 새로 생성되지 않음

3. 같은 body로 다시 요청한다.

- HTTP 200
- 같은 감사 ID와 만료 시각
- 활성 토큰과 감사 이력이 추가되지 않음
- 내려받은 PDF의 승인 링크가 첫 PDF와 동일함

4. 다른 멱등 키를 사용하되 `reissue` 없이 요청한다.

- HTTP 409
- 기존 토큰과 감사 이력은 그대로 유지됨

5. 응답 유실을 가정해 새 멱등 키와 `reissue: true`로 요청한다.

```json
{
  "idempotencyKey": "<NEW_IDEMPOTENCY_UUID>",
  "reissue": true
}
```

- HTTP 201
- 이전 승인 링크는 공개 GET에서 사용할 수 없음
- 새 감사 generation이 1 증가하고 이전 이력에는 `superseded_at`이 기록됨
- 새 링크는 공개 GET에서 조회 가능

6. PDF를 열어 다음을 육안 확인한다.

- 고객명, 견적 제목·본문, 전체 작업 범위
- 총액, 선수금·잔금과 각 결제 조건
- 예상 작업 기간, 발급·만료 시각
- 한글이 깨지지 않고 긴 내용이 다음 페이지로 이어지는지
- 승인 URL을 클릭하면 기존 고객용 견적 화면으로 이동하는지

7. PDF 링크로 공개 GET 후 명시적 승인 POST를 호출한다.

- GET만으로 견적 상태가 바뀌지 않음
- 승인 POST는 한 번만 성공하고 견적 상태가 `approved`로 변경됨
- 승인 후 반복 POST와 이전 링크는 사용할 수 없음

## 오류·보안 QA

- 관리자 인증 없음: 401
- 잘못된 버전 UUID 또는 body: 400
- 없는 버전: 404
- 최신이 아닌 버전, 승인·취소된 견적, 명시하지 않은 재발급: 409
- 전용 키 또는 공개 origin 누락: 503
- 오류 응답, 서버 로그, 견적 상세 API에 승인 토큰 원문·토큰 해시·멱등 키 해시·승인 URL·고객 연락처가 없는지 확인
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_EMAIL_ENCRYPTION_KEY`가 없어도 수동 발급이 동작하는지 확인
