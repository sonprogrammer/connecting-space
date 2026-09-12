---
name: implementing-imweb-backend
description: Use when implementing API, Supabase, authentication, migration, worker, queue, or external-provider backend work in the connecting-space imweb repository.
---

# imweb 백엔드 구현

확정된 이슈·API·데이터 계약을 백엔드로 구현하고, 로컬 통합 검증 후 QA가 검토할 수 있는 feature PR로 인계한다. 이 스킬은 화면·스타일·최종 QA·머지·운영 배포를 다루지 않는다.

## 작업 경계

- 전용 브랜치/worktree를 `origin/main` 최신 기준으로 만들고 기존 dirty/untracked 파일을 보존한다.
- `AGENTS.md`, 설치된 `node_modules/next/dist/docs/`, 기존 migration/RPC/RLS/generated type/test 패턴을 먼저 읽는다.
- Frontend UI는 구현하지 않는다. Frontend가 사용할 API 입력·응답·오류 계약만 문서화한다.
- 기능 PR 중 `supabase db push --linked`, 원격 SQL, migration repair, 운영 데이터 수정, Vercel 배포, PR 머지는 금지한다. 원격 migration은 머지 후 별도 명시 지시에서만 수행한다.

## RED → GREEN → REFACTOR

1. API/schema/보안/상태 전이의 실패 테스트를 먼저 작성하고, 예상 원인의 RED를 확인한다.
2. 계약에 맞는 최소 구현으로 GREEN을 만든다. DB 변경은 migration 계약 테스트와 격리된 로컬 Supabase 통합 테스트를 함께 만든다.
3. 중복·동시성·rollback·만료·폐기·provider 실패를 검증한 뒤 중복 로직과 경계를 정리한다. 매 단계 관련 테스트를 다시 실행한다.

## API 계약

- 인증·권한을 body 파싱과 mutation보다 먼저 확인한다.
- path/query/body와 경계값을 schema로 검증하고 상황에 맞는 400/401/403/404/409/410/429/500/503 및 안정된 오류 코드를 반환한다.
- Supabase/provider 원문 오류, stack, PII, token, 승인 URL을 응답·로그에 넣지 않는다.
- GET은 mutation하지 않는다. 동일 요청·재시도·만료·폐기·완료 상태와 최소 응답 필드를 명시한다.

## DB·worker·provider

- migration은 append-only이며 기존 적용 파일을 수정하지 않는다. enum/NOT NULL/unique/FK/backfill 영향과 generated DB type을 함께 검토한다.
- 여러 테이블 변경은 transaction 또는 security-definer RPC로 원자 처리하고, `search_path`, grant/revoke, 역할별 RLS를 명시·검증한다.
- unique/row lock으로 중복·동시 요청을 방어한다. 실패 중간 상태를 남기지 않는다.
- worker 상태(`pending/processing/retry/failed/completed`), bounded retry/backoff/최대 시도/stale lock 회수를 고정한다. idempotency key와 payload는 재시도에도 안정적이어야 한다.
- 외부 전송과 핵심 저장을 분리한다. provider 성공 후 finalize 실패를 재처리할 수 있게 하고, 실제 key 없이 계약·오류·retry를 테스트한다. webhook URL·수신자·본문·provider 원문 오류는 마스킹한다.

## 로컬 DB 안전

통합 테스트 전 URL host가 정확히 `localhost` 또는 `127.0.0.1`인지 확인한다. 허용되는 것은 격리 로컬 Supabase와 로컬 `supabase db reset`뿐이다. 로컬 환경이 없으면 원격으로 대신 검증하지 말고 `BLOCKED`를 보고한다. 실제 key/token/project ref와 고객 데이터를 명령 출력·로그·PR에 남기지 않는다.

## 자체 검증과 PR 인계

PR 직전 최신 HEAD에서 다음을 실행하고 pass/skip 수를 기록한다.

```bash
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check <base>...HEAD
```

DB 변경이면 migration-from-zero, RPC/RLS/trigger, 동시성·rollback·멱등·retry·만료·폐기 및 기존 DB 회귀 통합 suite를 추가한다. DB suite가 skip된 `npm test`만으로 통합 검증 완료를 주장하지 않는다.

PR 본문에는 `Closes #<issue>`, 변경 요약, migration과 원격 미적용 사실, 새 환경변수, 테스트 수치/명령, 보안·RLS·멱등성 검증, 남은 운영 수동 확인, Frontend 계약을 한글로 작성한다. QA에는 다음 문구를 사용한다.

```markdown
PR #<number> 최신 HEAD `<full-sha>`를 `reviewing-backend-pull-requests`로 검증해 주세요.
API·인증·RLS·migration·원자성·멱등성·동시성·retry·비밀 비노출을 확인하고 PR에 PASS/FAIL/BLOCKED를 남겨 주세요. 원격 DB와 코드는 변경하거나 머지하지 마세요.
```

QA FAIL은 전체 피드백을 이해한 뒤 같은 브랜치에서 수정하고, 새 HEAD로 자체 검증 후 재검증을 요청한다. 핵심 계약 결정 부재, 선행 migration 충돌, 로컬 DB 부재, 운영 권한 필요, 데이터 삭제 요구, 안전하게 해결할 수 없는 사용자 변경 충돌은 임의 우회하지 말고 중단·보고한다.

상세 기준과 RED/GREEN 기록은 [backend-development-reference.md](references/backend-development-reference.md)를 현재 작업에 필요한 부분만 읽어 참조한다.
