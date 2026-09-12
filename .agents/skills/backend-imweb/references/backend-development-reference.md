# imweb 백엔드 상세 기준

## 위험별 확인표

| 영역 | 확인할 것 | 증거 |
| --- | --- | --- |
| API | auth-first, schema, 안정된 오류, 최소 응답 | route 계약 테스트 |
| DB | append-only, 제약, lock/RPC 원자성, grant/RLS | migration 계약 + 로컬 통합 |
| worker | 상태 전이, bounded retry/backoff, stale lock, finalize 재처리 | worker suite |
| provider | 독립 설정, 비-2xx 매핑, 안정 key, 마스킹 | mock 계약/오류 테스트 |
| 보안 | token/URL/key/PII 비저장·비노출 | 응답·로그·DB 조회 검사 |

## 로컬 통합 절차

1. `supabase start` 후 status에서 URL host가 `localhost`/`127.0.0.1`인지 확인한다.
2. `supabase db reset`으로 로컬 migration-from-zero를 적용한다. 원격 연결 플래그는 사용하지 않는다.
3. 변경 RPC/RLS/trigger와 동시 요청, 동일 idempotency, rollback, retry, 만료·폐기·승인 회귀를 실행한다.
4. 테스트 총수와 skip 수를 기록한다. skip된 DB suite는 BLOCKED이며 PASS 근거가 아니다.

## PR 체크리스트

- 이슈 연결(`Closes #...`), 전체 테스트 명령·수치, 최신 full HEAD SHA
- 원격 DB 변경: 하지 않음, migration 파일과 적용하지 않은 이유
- Frontend 요청/응답/오류 상태 및 환경변수 이름(비밀값 제외)
- QA가 재현할 API 입력, RLS·동시성·멱등성·retry·비밀 비노출 방법
- provider 실서비스 발송·운영 설정처럼 코드로 확인하지 못한 수동 확인

## RED 압박 시나리오 기록

### RED — 스킬 미적용 baseline

`backend-imweb` 스킬 파일이 없는 상태에서 계약 검사 실행:

```text
AssertionError: RED: backend-imweb skill is not installed
```

이는 설치 전에는 백엔드 전용 경계와 안전 규칙을 검사할 문서가 없음을 입증한다.

### GREEN 기대

스킬 설치 후 계약 검사에서 다음이 모두 PASS여야 한다: auth-first, 로컬 DB만 사용, 원격 migration 금지, skip 공개, transaction/lock/idempotency, provider 분리, 비밀·PII 마스킹, Frontend 제외, PR/QA 인계.

### REFACTOR 검토

초기 문서의 반복 설명을 제거하고, 공통 원칙은 `SKILL.md`, 표·절차·압박 기록은 이 reference로 분리했다. 계약 검사 스크립트가 핵심 문구와 링크를 기계적으로 확인하며, 기능 코드·DB·배포 변경은 없다.

## 압박 시나리오별 검증 기록

아래 RED는 스킬을 로드하지 않은 baseline에서 동일한 요청을 판단할 때 발생하는 위험한 선택을 재현한 기록이고, GREEN은 스킬 적용 후 요구되는 관찰 가능한 결정이다. 실제 외부 시스템 호출은 하지 않았다.

| # | RED baseline 관찰 | GREEN 기준 |
|---|---|---|
| 1 | 로컬 DB가 없는데 연결된 원격 Supabase로 migration을 시험하려 함 | 원격 대체를 거부하고 `BLOCKED` 보고 |
| 2 | 단위 테스트 통과만으로 통합 검증 완료를 주장함 | DB suite skip 수를 공개하고 완료 주장 금지 |
| 3 | Slack 미설정 때문에 AI 초안 저장까지 실패시킴 | 핵심 저장과 provider 알림 작업을 분리 |
| 4 | 동시 요청을 mock 한 번으로만 검증함 | transaction/lock/unique와 동시 통합 테스트 사용 |
| 5 | body를 읽고 나서 관리자 인증을 검사함 | auth-first로 body/DB mutation 전에 거부 |
| 6 | provider 원문 오류와 고객 이메일을 로그에 남김 | 안정 코드와 마스킹된 로그만 남김 |
| 7 | Backend 이슈에서 관리자 UI까지 구현함 | API 계약만 제공하고 Frontend 범위 분리 |
| 8 | 자체 테스트 후 main push·머지를 수행함 | feature PR을 만들고 QA/Planner에 인계 |
| 9 | 머지 전 원격 migration 적용을 수락함 | 명시적 머지 후 작업으로 분리하고 기능 단계에서는 거부 |
