# 이슈 #62 견적 이메일 발송 QA

## 검증 전 준비

이 기능은 아래 서버 환경변수가 필요하다. 실제 값은 저장소, 이슈, PR, 브라우저 로그에 남기지 않는다.

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `QUOTE_EMAIL_ENCRYPTION_KEY`: 32바이트 값을 base64로 인코딩한 전용 키
- `QUOTE_PUBLIC_BASE_URL`: 고객용 공개 사이트의 신뢰된 HTTP(S) origin
- 기존 `AUTOMATION_PROCESS_SECRET`, `SLACK_INQUIRY_WEBHOOK_URL`, `ADMIN_BASE_URL`

새 migration `202609070001_quote_email_delivery.sql`은 QA 환경에 배포 담당자가 별도로 적용해야 한다. 개발 과정에서는 원격 DB에 적용하지 않았다.

## 관리자 API 확인

1. 이메일이 있는 문의의 최신 견적 버전에 `POST /api/admin/quote-versions/{versionId}/send`를 관리자 세션으로 호출한다.
2. 최초 응답이 `202`이고 `data.status`가 `queued`인지 확인한다.
3. 같은 API를 즉시 다시 호출해 `200`과 동일한 `jobId`, `approvalTokenId`, `generation`이 반환되는지 확인한다.
4. 응답에 토큰 원문, `/quotes/{token}` URL, 수신 이메일, 메일 본문, 암호화 컬럼, provider ID가 없는지 확인한다.
5. 이메일이 없거나 형식이 잘못된 문의는 `400 QUOTE_RECIPIENT_EMAIL_REQUIRED`이며 토큰과 작업 행이 생기지 않는지 확인한다.

## worker와 성공 상태 확인

1. 기존 내부 automation processing 요청을 `AUTOMATION_PROCESS_SECRET`으로 호출한다.
2. Resend 수신함에서 견적 요약, 한국 시간 만료일, 승인 버튼을 확인한다.
3. Resend 성공 전 견적은 `draft`, 토큰 `expires_at`은 `null`인지 확인한다.
4. 성공 뒤 작업은 `sent`, 견적은 `sent`, 토큰 만료는 발송 성공 시각 기준 정확히 7일 뒤인지 확인한다.
5. 같은 작업을 재처리해도 Resend 요청의 idempotency key가 `quote-approval/{jobId}`로 유지되고 같은 메일이 중복 생성되지 않는지 확인한다.

## 실패·retry·재발급 확인

1. 로컬 또는 격리 QA에서 Resend 호출을 실패시켜 작업이 `retry` 후 최대 시도에서 `failed`가 되는지 확인한다. 견적은 계속 `draft`여야 한다.
2. `POST /api/admin/quote-email-jobs/{jobId}/retry`를 호출해 `202`를 받고, 작업·토큰·generation이 바뀌지 않는지 확인한다.
3. 실패 작업에 `/send`를 다시 호출하면 새 메일을 만들지 않고 `409 QUOTE_EMAIL_RETRY_REQUIRED`인지 확인한다.
4. 만료·폐기된 토큰은 retry가 `409 QUOTE_EMAIL_REISSUE_REQUIRED`이고, `/send` 호출 시 같은 견적 버전에 다음 generation과 새 토큰이 만들어지는지 확인한다.
5. 최초 dispatch 뒤 24시간 경계 전에는 동일 작업 retry가 가능하고, 경계 시각부터는 `409 QUOTE_EMAIL_REISSUE_REQUIRED`인지 확인한다. 이때 기존 작업·토큰은 supersede/revoke되어 다음 `/send`가 새 generation을 만들어야 한다.
6. worker가 `processing`의 마지막 시도에서 중단된 상황을 만들고 5분 뒤 실행해 이메일과 Slack 작업이 `failed`로 종결되는지 확인한다. 시도 횟수가 남은 stale lock은 재claim되어야 한다.

## 만료와 Slack 확인

1. 만료까지 24시간 이하인 유효한 `sent` 토큰으로 lifecycle worker를 두 번 실행한다.
2. 관리자 Slack 알림 작업과 메시지가 토큰당 한 번만 만들어지고, 고객 이메일이나 견적 본문이 Slack에 포함되지 않는지 확인한다.
3. 승인·취소·폐기·교체·사용된 토큰은 알림 대상에서 제외되는지 확인한다.
4. 만료 시 견적이 `expired`, 토큰이 폐기되고 기존 발송 generation이 supersede되는지 확인한다.
5. 이미 `sent`인 작업의 `/send`와 `/retry` 멱등 응답에서 실제 `expiresAt`과 `expirationAlertStatus`가 반환되는지 확인한다.

## 로컬 자동 검증

원격 연결 정보가 없는 별도 로컬 Supabase에서 migration을 처음부터 적용한 뒤 다음을 실행한다.

```bash
RUN_QUOTE_INTEGRATION_TESTS=1 npm test
npm run lint
npm run type-check
npm run build
git diff --check
```

통합 테스트는 Supabase URL의 호스트가 `127.0.0.1` 또는 `localhost`가 아니면 즉시 중단한다.
