# 운영 모니터링·장애 대응

관련 이슈: [#47](https://github.com/sonprogrammer/connecting-space/issues/47). 기준: PR #95까지 반영된 코드. 이 문서는 절차서이며 운영 설정 변경·배포를 실행한 기록이 아니다.

## 1. 최초 확인

1. 장애 발생 시각과 시간대, 대상 API, HTTP status, 오류 코드, 배포 SHA를 기록한다. Vercel Runtime Logs의 시각은 UTC이므로 KST와 구분한다.
2. 브라우저 요청의 Request ID 또는 `x-vercel-id`가 있으면 내부 장애 기록에 남겨 로그와 대조한다. 쿠키·Authorization·비밀번호·요청 본문은 복사하지 않는다.
3. Vercel 프로젝트의 현재 Production 배포와 최근 변수 변경 시점을 확인한다. Preview 성공이 Production 복구를 뜻하지 않는다.
4. API 응답과 작업 상태를 따로 확인한다. workflow 성공/HTTP 200이어도 개별 작업은 `retry`·`failed`일 수 있다.
5. 변경이 필요하면 손 대표님 승인 후 해당 절차를 실행한다. 이 문서 작성·검토만으로 운영 변경을 실행하지 않는다.

## 2. 설정 위치와 이름

값은 시크릿 관리 화면에서만 취급한다. 아래 표에는 이름만 기록한다.

| 위치 | 이름 | 용도 |
| --- | --- | --- |
| GitHub 저장소 Settings → Secrets and variables → Actions → Variables | `AUTOMATION_PROCESS_URL` | Production 앱의 base URL. workflow가 `/api/internal/automation/process`를 덧붙이므로 API 경로를 중복 입력하지 않는다 |
| 같은 화면 → Secrets | `AUTOMATION_PROCESS_SECRET` | worker 호출 인증. Vercel의 동명 변수와 일치해야 한다 |
| Vercel 프로젝트 Settings → Environment Variables, Production | `AUTOMATION_PROCESS_SECRET` | worker 인증 |
| Vercel Production | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase 연결과 서버 전용 작업 권한 |
| Vercel Production | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, 선택적 `AI_BASE_URL` | AI 초안 생성 |
| Vercel Production | `SLACK_INQUIRY_WEBHOOK_URL`, `ADMIN_BASE_URL` | Slack 발송과 관리자 링크 |
| Vercel Production | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_EMAIL_ENCRYPTION_KEY`, `QUOTE_PUBLIC_BASE_URL` | 견적 이메일과 암호화 payload |
| Vercel Production | `QUOTE_MANUAL_DELIVERY_TOKEN_KEY` | 수동 PDF 승인 토큰 파생 |
| Vercel Production | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_HASH_SECRET` | 로그인·문의 rate limit |
| Vercel Production | `NEXT_PUBLIC_APP_URL`, 선택적 `CSRF_ALLOWED_ORIGINS` | Production Origin과 명시적으로 승인한 추가 Origin |

Standard REST 토큰, service role, worker secret 등 서버 비밀에는 `NEXT_PUBLIC_` 접두어를 붙이지 않는다. Production·Preview 환경 범위를 확인하고 Preview Origin에 wildcard를 넣지 않는다. 실제 계정의 설정·요금제는 별도 확인 대상이다.

## 3. Vercel Runtime Logs에서 Upstash 503 찾기

1. Vercel에서 올바른 팀/프로젝트를 선택하고 **Logs**를 연다. Build 로그가 아니라 Runtime Logs를 사용한다.
2. Environment를 **Production**, 장애 발생 시간 범위, Request Path를 `/api/auth/login` 또는 `/api/inquiries`, Method를 POST, Status를 503으로 좁힌다.
3. Resource에서 **Routing Middleware**를 포함한다. UI에서 Proxy가 Middleware로 표시될 수 있다. Level은 Error뿐 아니라 Warning도 포함한다.
4. `rate_limit_unavailable`로 검색하고 요청을 펼쳐 JSON 로그의 `reason`을 확인한다. JSON이 검색 화면에서 별도 필드로 파싱되지 않으면 로그 메시지에서 확인한다.
5. `reason=upstash_pipeline_command_error`이면 `command_errors` 배열의 `command`와 `error_type`을 확인한다. 최신 진단 코드가 해당 Production 배포 SHA에 포함되어 있는지도 확인한다.

합성 예시(실제 장애 원인이나 값이 아님):

```json
{"event":"rate_limit_unavailable","provider":"upstash","reason":"upstash_pipeline_command_error","command_errors":[{"command":"incr","error_type":"permission_denied"},{"command":"expire","error_type":"permission_denied"}]}
```

| reason | 확인할 내용 |
| --- | --- |
| `rate_limit_hash_secret_missing` | Production의 hash secret 누락. 이 단계에서는 Upstash 호출 전 차단된다 |
| `upstash_url_missing` / `upstash_url_invalid` | REST URL 설정 누락·형식·HTTPS/Upstash host 검사 실패 |
| `upstash_token_missing` | REST token 설정 누락 |
| `upstash_fetch_failed` | 네트워크/접속 실패. 원문 예외·URL을 공유하지 않는다 |
| `upstash_http_error` | 숫자 `status` 확인. 인증·무료 한도·공급자 장애를 해당 콘솔에서 대조한다 |
| `upstash_json_parse_failed` | 응답 JSON 해석 실패 |
| `upstash_pipeline_command_error` | 아래 명령별 고정 코드를 확인한다 |
| `upstash_pipeline_response_invalid` | 응답 항목 수·타입·카운터 형식 불일치 |
| `upstash_expire_result_mismatch` | EXPIRE의 숫자 결과가 1이 아니어서 TTL 설정을 보장할 수 없음 |
| `rate_limit_internal_error` | 위 분류 외 내부 오류. 담당 백엔드에 배포 SHA와 고정 reason을 전달한다 |

`command=incr`는 카운터 증가, `command=expire`는 TTL 설정 명령이다. 둘 다 오류면 배열에 두 항목이 들어간다.

| error_type | 해석과 다음 확인 |
| --- | --- |
| `integer_or_range` | 표준 숫자/범위 오류. 비숫자 값인지 범위 문제인지는 이 코드만으로 확정할 수 없음 |
| `wrong_type` | 대상 자료형 불일치 가능성. key 수정/삭제 없이 담당자 조사 요청 |
| `permission_denied` | 명령 권한 확인. Read Only 토큰 오사용, ACL 제한 등을 확인 |
| `authentication_required` | 토큰·연결 대상 DB 일치 여부 확인 |
| `read_only` | 쓰기 거부 상태. 토큰 종류와 공급자 상태 확인 |
| `out_of_memory` | 공급자 용량 상태 확인 |
| `unknown` | 허용 목록 밖 오류. 응답 원문을 로그에 추가하지 말고 별도 안전한 조사 요청 |

Usage 증가만으로 두 명령 성공을 판단하지 않는다. HTTP 200 pipeline도 개별 명령 error를 포함할 수 있다. 무료 한도 초과·저장소 장애는 의도적으로 503 fail-closed이며 문의와 관리자 로그인도 차단된다. 유료 우회·자동 업그레이드는 금지한다.

## 4. 이번 Upstash 503 사례

확인된 증상은 운영 로그인 요청이 Middleware에서 503으로 종료된 것이다. 초기에 Usage 증가가 관찰되지 않았고, 이후 Usage 증가와 `upstash_pipeline_error` → `upstash_pipeline_command_error`가 관찰되어 진단 로그를 단계적으로 보강했다(PR #93, #94, #95).

그 후 Vercel Production 로그의 `command_errors`에서 **INCR와 EXPIRE 모두 `permission_denied`**로 확인됐다. 이번 장애 원인은 rate limit의 쓰기 명령에 필요한 권한이 없는 토큰 사용이었다. 손 대표님이 서버용 쓰기 권한을 가진 **Standard REST 토큰으로 교체한 뒤 운영 로그인 정상 동작과 Upstash Usage 증가를 확인**했다.

위 운영 결과는 [PR #96 플래너 확인 코멘트](https://github.com/sonprogrammer/connecting-space/pull/96#issuecomment-6382383052)에 근거한다. 이 문서 작업에서 운영 설정을 변경하거나 복구를 재실행한 것은 아니다. 키의 비숫자 값·자료형 문제가 이번 장애 원인으로 확인된 것은 아니며, Usage 증가만으로 복구를 판정하지 않고 로그인 정상 동작도 함께 확인했다. 아래 절차는 같은 권한 오류가 재발할 때 사용할 대응 절차다.

### Standard REST 토큰 확인

1. Upstash 콘솔에서 이 앱에 연결된 **기존 Free Redis DB**를 선택한다. 새 DB나 유료 플랜을 생성하지 않는다.
2. Connect → REST에서 `UPSTASH_REDIS_REST_URL`과 토큰 종류를 확인한다. **Read-Only Token 스위치를 끈 Standard 토큰**을 선택한다. TCP 비밀번호를 REST 토큰 대신 쓰지 않는다.
3. INCR와 EXPIRE는 쓰기 명령이므로 Read Only 토큰으로 실행할 수 없다. Standard 토큰은 전체 권한을 가지므로 서버 전용 시크릿으로만 취급한다.
4. REST URL과 Standard 토큰이 동일 DB의 값인지 승인된 비공개 화면에서 확인한다. 토큰 원문·일부 문자열·스크린샷을 이슈/PR/채팅에 남기지 않는다.
5. 실제 로그가 숫자/자료형 오류를 가리키면 토큰 교체만으로 해결됐다고 간주하지 않는다. key 삭제·reset·FLUSH 명령은 실행하지 않고 별도 조사한다.

### 승인 후 Vercel Production 변수 교체와 재배포

1. 변경 승인, 대상 프로젝트, 현재 Production deployment ID/SHA, 되돌릴 코드 버전을 기록한다. 시크릿 백업이 필요하면 승인된 비밀 저장소에만 보관한다.
2. Vercel Settings → Environment Variables에서 `UPSTASH_REDIS_REST_TOKEN`의 **Production** 범위를 선택한다. 기존 잘못된 토큰을 같은 DB의 Standard REST 토큰으로 교체한다. 값은 따옴표·Bearer 접두어·개행 없이 등록한다.
3. `UPSTASH_REDIS_REST_URL`은 같은 DB의 REST URL인지 확인한다. 잘못된 경우에만 승인 범위 안에서 교체한다. `RATE_LIMIT_HASH_SECRET`은 누락 여부를 확인하며 불필요하게 교체하지 않는다(교체하면 식별자 해시가 바뀐다).
4. Production 범위에만 저장한다. 카드 등록·유료 전환·자동 업그레이드 및 Preview 변수 변경을 함께 수행하지 않는다.
5. 변수 저장만으로 기존 배포가 바뀌지 않는다. Deployments에서 검증된 Production 코드 배포를 선택하고 **Redeploy**한다. 대상이 Production인지와 사용할 SHA를 확인한다. 최신 Production 변수를 적용하는 새 배포를 생성한다. 환경변수 관련 장애에서는 기존 Build Cache 재사용을 해제하고 재빌드하는 절차를 권장한다.
6. 배포가 Ready가 된 뒤 Production 도메인이 새 deployment를 가리키는지 확인한다. 승인된 관리자 계정으로 로그인 1회를 수행하고 정상 세션 발급을 확인한다. 비밀번호·쿠키·토큰은 기록하지 않는다.
7. 같은 시간대 Runtime Logs에서 해당 요청의 503/명령 오류가 사라졌는지 확인한다. Usage 변화는 보조 지표로만 사용한다. 부하 테스트나 테스트 문의 생성은 별도 승인 없이 하지 않는다.
8. 복구되지 않으면 반복 재배포하지 않고 새 reason·command/error_type·배포 SHA로 재분류한다. 실패와 성공 시각, 변경한 변수 **이름**과 담당자만 장애 기록에 남긴다.

## 5. GitHub Actions·자동화 작업 대응

저장소 Actions → **Process automation jobs**를 연다. `.github/workflows/automation-process.yml`은 5분 간격 schedule과 수동 workflow_dispatch를 제공한다. GitHub schedule은 지연될 수 있으므로 정확한 5분 완료를 보장하지 않는다.

읽기 전용 확인 명령(로그 원문 전체를 외부 공유하지 않는다):

```bash
gh run list --workflow automation-process.yml --limit 10
gh variable list
gh secret list
```

위 목록 명령은 설정 이름/존재 확인용이며 값 일치까지 증명하지 않는다.

| 증상 | 대응 |
| --- | --- |
| Validate 단계 실패 | Actions Variables/Secrets의 필수 이름 확인 |
| worker 401 `AUTOMATION_AUTH_REQUIRED` | GitHub Secret과 Vercel Production 동명 secret 불일치·인증 header 확인 |
| worker 404 | base URL, endpoint 경로 중복, Production 배포에 route 포함 여부 확인 |
| worker 503 `AUTOMATION_NOT_CONFIGURED` | Vercel worker secret 누락 확인 |
| worker 503 `SLACK_NOT_CONFIGURED` | Slack webhook/관리자 base URL 설정 확인. 다른 작업이 이미 처리됐을 수 있으므로 상태 확인 |
| worker 500 | Runtime Logs와 해당 작업 상태 대조 후 담당자 조사 |
| workflow 성공인데 작업 미완료 | 응답의 `results`·`quoteResults`와 저장된 작업 상태를 확인. HTTP 200은 개별 작업 성공을 보장하지 않음 |

### 대기 큐와 안전한 재실행

1. 관리자 문의의 AI 초안/Slack 상태를 먼저 확인한다. 운영 DB 읽기 권한이 별도로 있는 담당자는 `automation_jobs`의 job_type, status, attempt_count/max_attempts, available_at, locked_at만 읽고 상태별 건수와 대기 시간을 확인한다. payload·고객 연락처·본문·key·토큰을 출력하지 않는다.
2. `pending`은 대기, `retry`는 available_at 이후 재시도, `processing`은 처리 중, `completed`는 완료, `failed`는 최종 실패다. `notification_deliveries`의 sent/failed와 구분한다. 견적 발송도 별도의 작업 상태를 확인한다.
3. 공급자 설정을 복구하고 처리 중인 run이 없는지 확인한 뒤 승인된 수동 실행을 **한 번** 수행한다. workflow 실행은 실제 AI/Slack/이메일 작업을 처리할 수 있다.

```bash
# 운영 실행 승인 후에만 수행
gh workflow run automation-process.yml --ref main
gh run list --workflow automation-process.yml --limit 5
```

4. 완료 후 queue와 delivery 상태를 다시 확인한다. due time이 미래인 retry는 바로 처리되지 않을 수 있고, failed 작업은 workflow만 다시 실행해도 재활성화되지 않는다.
5. 최종 실패한 문의 작업은 관리자 화면의 AI 재생성/Slack 재시도를 승인 후 사용한다. 재생성은 초안을 바꾸고 새 발송을 유발할 수 있다. DB 상태·lock·시도 횟수를 직접 수정하거나 완료된 발송을 강제로 재실행하지 않는다. Slack 전송 직후 기록 실패와 같은 경우 중복 알림 가능성이 있으므로 기존 전송 여부를 확인한다.

## 6. API 키·Webhook 교체와 롤백

1. 공급자와 영향 기능을 확인하고 승인된 비밀 저장소에서 새 자격증명을 준비한다. 원문을 shell 인자·히스토리·CI 로그·문서에 넣지 않는다.
2. Vercel의 해당 Production 변수만 교체하고 새 배포를 생성한 뒤 승인된 smoke check로 확인한다. worker secret 교체는 GitHub Actions Secret도 함께 맞추며 일시적 401 발생 가능성을 고려한다.
3. AI·Resend 키와 Slack webhook은 새 자격증명 동작 확인 후 이전 값을 폐기한다. 침해 대응이면 즉시 폐기가 필요할 수 있으므로 손 대표님과 순서를 정한다.
4. Upstash 비밀번호 reset은 Standard/Read Only 토큰을 함께 무효화할 수 있으므로 단순 token 종류 확인과 구분한다. 연결된 다른 클라이언트 영향도 확인한다.
5. `QUOTE_EMAIL_ENCRYPTION_KEY`·`QUOTE_MANUAL_DELIVERY_TOKEN_KEY`는 일반 API 키처럼 즉시 바꾸지 않는다. 기존 암호문/파생 토큰 처리에 영향을 주므로 별도 키 전환 계획이 필요하다.
6. 코드 문제면 승인 후 Vercel의 검증된 이전 Production deployment로 rollback한다. 단순 promotion/rollback으로 최신 환경변수가 반영된다고 가정하지 않는다. 변수 문제는 올바른 값으로 복원한 뒤 검증된 코드로 새로 redeploy한다. 이미 폐기한 토큰으로 되돌리지 않는다.
7. 배포 rollback은 DB·외부 발송·환경변수 변경을 되돌리지 않는다. DB reset·migration repair·운영 데이터 삭제로 복구하지 않는다.

## 7. 장애 기록·비밀 비노출 점검

- 기록 가능: 시간대 포함 시각, 배포 SHA/ID, API 경로, HTTP status, 고정 reason, command/error_type, 변경 변수 이름, 승인자/담당자, 검증 결과.
- 기록 금지: 응답 원문, Redis key, 토큰, URL의 비밀 경로, webhook, 비밀번호, 쿠키, 이메일, IP, 고객 본문, 환경변수 실제 값. Runtime Logs도 기본 메타데이터에 개인정보가 있을 수 있어 원본 내보내기 대신 위 허용 필드만 수기로 기록한다.
- 복구 완료 판단: 실제 Production 기능 smoke check와 해당 요청 로그, 작업/delivery 상태가 일치해야 한다. Usage나 Ready 상태만으로 완료 처리하지 않는다.
- 무료 운영 정책: Upstash Free 유지, 카드 등록·유료 전환·자동 업그레이드 금지. 한도 초과는 503으로 유지하고 손 대표님에게 보고한다.

## 공식 참고

- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel 환경변수](https://vercel.com/docs/environment-variables)
- [Vercel 자격증명 교체](https://vercel.com/docs/environment-variables/rotating-secrets)
- [Vercel 배포 관리](https://vercel.com/docs/deployments/managing-deployments)
- [Upstash REST Standard/Read Only 토큰](https://upstash.com/docs/redis/features/restapi)
