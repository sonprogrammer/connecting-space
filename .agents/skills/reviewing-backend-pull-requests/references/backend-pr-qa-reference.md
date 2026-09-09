# Backend PR QA reference

## Required evidence

Capture PR URL/number, base, full HEAD SHA, issue criteria/design decisions, API/migration/env notes, `AGENTS.md`, changed files and full diff, migration order, and CI status. Run `git diff --check <base>...<head>`. Inspect lockfiles, env examples, generated types, unrelated files, remote URLs, customer data, secrets, and debug logs. Use installed Next.js docs when Route Handler behavior matters.

## Risk matrix

| Risk | Direct evidence |
|---|---|
| API/auth | unauthenticated, unauthorized, malformed/boundary, not-found, success, repeat/conflict/expiry/revocation; stable status/error code; no body/DB work before auth |
| DB/RPC/RLS/migration | localhost-only Supabase; migration from zero; constraints/indexes/triggers/backfill; role policies/grants; locks/atomic rollback; duplicate/concurrent requests; generated types and regression suite |
| Worker/provider | deterministic payload/idempotency; timeout/non-2xx; bounded retry/backoff; stale lock and finalize recovery; duplicate suppression; redacted logs |
| Privacy/security | hashed/encrypted tokens where needed; no GET mutation; no PII/secret/provider body in response/log/comment; server-side ownership/status/amount checks; least-privilege search path/grants |

`npm test` output must include pass/fail/skip counts. A skipped local DB suite is not integration evidence for a DB PR.

## Local DB safety

Before any DB integration command, assert the URL host is exactly `localhost` or `127.0.0.1`. Never run `supabase db push`, `supabase migration repair`, or remote SQL. `supabase db reset` is allowed only after confirming an isolated local project. Do not print keys, tokens, customer data, or remote project refs. If a DB-change PR cannot run isolated local integration, verdict is `BLOCKED`, not a manual follow-up.

## Provider/manual boundary

Missing provider credentials do not block code contract tests unless real delivery is explicitly an acceptance criterion. For ordinary QA, write manual checks as `설정 위치 → 실행 동작 → 정상 기준`, e.g. `Resend sandbox 설정 → 테스트 수신함 확인 → HTML/text, 발신자, 링크가 계약과 일치하고 수신자 개인정보가 로그에 없음`. If real delivery is an explicit completion condition and unavailable, use `BLOCKED`.

## Pressure rules

1. Developer integration-test reports never replace direct local DB execution.
2. A new HEAD or migration invalidates every earlier verdict; rerun from zero.
3. Remote mutation requests are refused; isolate locally.
4. Unit tests do not prove concurrent atomicity/idempotency; reproduce two simultaneous calls and inspect persisted rows.
5. Unrelated unapplied migrations are not repaired or applied; stop and report scope.
6. Redact PII, tokens, provider bodies, and DB errors; use stable codes and masked examples.

## PR comment template

```markdown
## QA 결과 — PASS | FAIL | BLOCKED

- 검증 HEAD: `<full-sha>`
- base: `<branch>`
- 변경 위험: `<API | Auth | DB | Worker | Provider | Security>`

### 자동 검증
- `npm test`: PASS — <pass>/<total>, skip <count>
- `npm run lint`: PASS
- `npm run type-check`: PASS
- `npm run build -- --webpack`: PASS
- `git diff --check <base>...<head>`: PASS

### API·보안·무결성 검증
- <위험>: PASS | FAIL — <재현 근거>

### 로컬 DB 통합 검증
- 대상: `<localhost/127.0.0.1 | DB 변경 없음>`
- 결과: PASS | FAIL | BLOCKED | N/A
- 원격 DB 변경: 하지 않음

### 발견 사항
- 없음
<!-- 또는 [BLOCKER|MAJOR|MINOR] 재현 명령/입력 · 기대 · 실제 -->

### 손 대표님 수동 확인
- 없음
<!-- 또는 설정 위치 → 실행 동작 → 정상 기준 -->

### 제한 사항
- <실행하지 못한 항목과 판정 영향>

**Planner 권고: 머지 검토 가능 | 수정 후 재검증 | 차단 해소 후 재검증**
```
