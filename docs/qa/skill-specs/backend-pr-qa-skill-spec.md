# 백엔드 PR QA 스킬 제작 명세

## 문서 목적

이 문서는 QA 에이전트가 이 저장소의 백엔드 PR을 독립 검증하는 재사용 스킬을 만들 때 사용하는 입력 명세다. 완성된 스킬 자체가 아니며, 스킬 제작자는 프론트엔드 QA 스킬과 섞어 한 번에 만들지 않고 이 문서만으로 별도 RED→GREEN→REFACTOR 검증을 수행한다.

## 권장 스킬 식별자

- 이름: `reviewing-backend-pull-requests`
- 트리거 설명 예시: `Use when independently validating a backend pull request before a planner decides whether to merge it.`
- 적용 대상: Route Handler, 서버 모듈, 인증, Supabase RPC·RLS·migration, worker, 외부 provider 연동이 포함된 PR
- 제외 대상: 화면·스타일만 변경된 PR, 승인된 migration을 운영에 적용하는 배포 작업

## 핵심 원칙

- 최신 PR HEAD에서 QA가 직접 재현한 결과만 최종 판정 근거로 사용한다.
- 단위 테스트 통과와 데이터 무결성·권한·동시성 검증을 같은 것으로 취급하지 않는다.
- DB 변경은 격리된 로컬 Supabase에서 검증하고 원격 Supabase에는 절대 적용하지 않는다.
- 실제 외부 서비스와 운영 비밀값이 필요한 확인은 자동·계약 검증과 분리한다.
- QA는 코드 수정, commit, push, merge, 배포, 원격 migration, 운영 데이터 변경을 하지 않는다.
- 토큰 원문, API key, webhook URL, 고객 연락처와 본문을 PR·이슈·로그에 남기지 않는다.

## 필수 입력

검증 시작 전에 다음을 확보한다.

- PR 번호와 URL
- base 브랜치와 최신 HEAD SHA
- 연결된 이슈의 요구사항·완료 조건·기존 설계 결정
- PR 설명의 API 계약, QA 방법, migration 및 환경변수 목록
- 저장소의 `AGENTS.md`
- 변경 파일 목록과 전체 diff
- 선행·후속 migration 목록과 현재 CI 상태

개발자의 테스트 보고는 교차 확인 자료일 뿐 QA 실행을 대체하지 않는다.

## 위험 기반 범위 분류

변경 사항을 아래 범주로 분류하고 해당 검증을 선택한다.

- API 입력·응답·오류 계약
- 인증·인가·관리자 권한
- RLS·DB 함수·migration
- 트랜잭션·원자성·멱등성·동시성
- worker·queue·retry·stale lock
- 외부 provider·webhook·암호화
- 개인정보·비밀·로그
- 기존 API·schema·generated type 회귀

요구사항마다 `위험 → 검증 방법 → 기대 결과 → 실제 결과`를 연결한다.

## 표준 검증 절차

### 1. HEAD와 diff 고정

- 검증 HEAD SHA와 base를 기록한다.
- 전체 diff, migration diff, lockfile, 환경변수 예제를 확인한다.
- `git diff --check <base>...HEAD`를 실행한다.
- 무관한 변경, 원격 연결 정보, 실제 고객 데이터, 비밀값, 디버그 로그를 찾는다.
- 검증 뒤 HEAD가 바뀌면 기존 판정은 폐기하고 필수 검증을 다시 실행한다.

### 2. API·서버 코드 검토

- `AGENTS.md`를 먼저 읽는다.
- Next.js Route Handler 동작을 판단할 때 현재 설치 버전의 `node_modules/next/dist/docs/`를 확인한다.
- 입력은 schema로 검증하고 예상 가능한 오류는 안정적인 코드와 HTTP 상태로 매핑하는지 본다.
- 내부 DB/provider 오류, stack, 토큰, PII가 응답에 그대로 노출되지 않는지 확인한다.
- 인증 전에 request body나 DB mutation을 실행하지 않는지 확인한다.
- 관리자, 익명, 인증 사용자, service role의 책임과 권한이 구분되는지 확인한다.
- API 응답과 생성 타입이 실제 DB·클라이언트 계약과 일치하는지 확인한다.

### 3. 필수 정적·자동 검사

백엔드 코드가 변경된 PR은 최신 HEAD에서 다음을 직접 실행한다.

```bash
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check <base>...HEAD
```

- Next.js 16.2.11 요구사항에 맞는 Node.js 20.9 이상을 사용한다.
- 낮은 Node 버전 때문에 실패하면 설치된 적합한 버전으로 한 번 재실행한다.
- 적합한 환경이 없으면 제품 FAIL이 아니라 BLOCKED다.
- 테스트 총수, 통과·실패·skip 수를 기록한다.
- DB 통합 suite가 skip된 기본 `npm test`만으로 DB 변경 PR을 PASS 처리하지 않는다.

### 4. API 계약 검증

변경 endpoint마다 해당 항목을 확인한다.

- 인증 없음·권한 없음
- 잘못된 path/query/body와 경계값
- 대상 없음
- 정상 생성·조회·수정·재시도
- 동일 요청 반복
- 충돌·만료·폐기·이미 완료된 상태
- 외부 provider 또는 DB 오류
- 응답에 허용된 필드만 포함
- 상태 변경 전후의 HTTP code와 DB 상태 일치

mock만 호출됐다는 사실보다 실제 route의 입력·응답·상태 전이를 검증한다.

### 5. DB·migration 검증

migration, RPC, trigger, RLS, schema가 변경되면 격리된 로컬 Supabase 통합 검증이 필수다.

안전 조건:

- 대상 URL host가 `127.0.0.1` 또는 `localhost`인지 명시적으로 검사한다.
- project ref가 연결된 원격 명령을 실행하지 않는다.
- `supabase db push`, migration repair, 원격 SQL 실행을 하지 않는다.
- `supabase db reset`은 격리된 로컬 프로젝트임을 확인한 뒤에만 사용한다.
- 실제 key·token·고객 데이터는 출력하지 않는다.

검증 항목:

- 전체 migration을 처음부터 순서대로 적용 가능
- 새 테이블·enum·index·constraint·trigger가 의도와 일치
- 기존 데이터에 필요한 backfill과 NOT NULL 전환 안전성
- anon·authenticated·admin·service role별 RLS와 grant
- RPC가 필요한 행을 잠그고 관련 변경을 한 트랜잭션으로 처리
- 중복·동시 요청에서 unique violation이나 중복 데이터가 발생하지 않음
- 실패 중간 상태가 남지 않음
- 재실행·재시도·만료·폐기 수명주기 정상
- generated DB type과 schema 계약 일치
- 이전 기능 통합 suite 회귀 없음

DB 변경인데 QA가 로컬 통합 테스트를 실행할 수 없다면 손 대표님 수동 확인으로 넘기지 않고 `QA BLOCKED`다. 개발자의 통합 테스트 보고만으로 PASS하지 않는다.

### 6. 외부 provider·worker 검증

Resend, Slack, AI API 등 외부 서비스는 다음을 코드 QA에서 확인한다.

- 설정 누락이 관련 없는 작업을 막지 않음
- request payload와 idempotency key가 안정적
- timeout·non-2xx·잘못된 응답을 안전하게 처리
- retry 횟수·backoff·failed 종결·stale lock 회수
- provider 성공 뒤 DB finalize 실패 시 복구 가능
- 중복 실행이 중복 메일·메시지·작업을 만들지 않음
- 오류와 로그에서 provider 본문·수신자·비밀값 제거

실제 계정으로 보내야 하는 이메일·Slack·AI 품질 확인은 자동 계약 검증과 분리해 `손 대표님 수동 확인`에 적는다. 단, 이슈 완료 조건이 실발송 자체라면 필요한 운영 환경 없이는 BLOCKED로 판정한다.

### 7. 보안·무결성 검토

- 토큰은 충분한 엔트로피를 갖고 DB에는 필요한 경우 해시 또는 암호문만 저장
- GET 요청이 승인·결제·전환 같은 mutation을 일으키지 않음
- 공개 API가 고객명·연락처·내부 ID·관리자 메모를 과다 노출하지 않음
- 권한 검사가 클라이언트 주장이나 UI 숨김에만 의존하지 않음
- 금액·상태·소유권 검증을 DB 경계에서도 수행
- 멱등 키 원문이나 재사용 가능한 비밀을 로그·응답에 남기지 않음
- 서비스 역할 함수의 `search_path`, grant, revoke가 최소 권한 원칙에 맞음
- 동시 요청, 네트워크 재시도, worker 재시작에도 중복 생성이 없음

## 판정 계약

### PASS

다음 조건을 모두 만족하면 `QA PASS`다.

- 최신 HEAD의 필수 자동 검사가 통과했다.
- 변경 위험에 해당하는 API·보안·무결성 검증이 통과했다.
- DB 변경 PR은 QA가 로컬 통합 테스트를 직접 통과시켰다.
- 머지를 막는 BLOCKER·MAJOR 결함이 없다.
- 실제 운영 서비스 확인은 별도 수동 목록으로 분리됐다.

### FAIL

다음 중 하나가 재현되면 `QA FAIL`이다.

- 코드 문제로 테스트·lint·type-check·build 실패
- API 계약·상태 코드·오류 매핑 불일치
- 인증 우회, RLS 누락, PII·비밀 노출
- 부분 저장, 중복 생성, 잘못된 재시도·만료 처리
- migration이 초기 DB 또는 기존 schema 순서에서 실패
- 데이터 손실 가능성이 있는 schema 변경
- 기존 API·worker·DB 흐름 회귀

FAIL에는 심각도, 재현 명령, 입력 조건, 기대 결과, 실제 결과, HEAD SHA를 포함한다. 비밀값과 개인정보는 마스킹한다.

### BLOCKED

필수 코드 검증을 안전하게 실행할 수 없을 때만 `QA BLOCKED`다.

- DB 변경 PR인데 격리 로컬 Supabase를 사용할 수 없음
- 필수 선행 migration·API·환경 파일이 누락됨
- 의존성 또는 적합한 Node 런타임을 확보할 수 없음
- 이슈가 명시적으로 요구하는 실서비스 검증 환경이 없음

일반적인 실발송·운영 계정 확인이 완료 조건이 아니라면 수동 확인 항목이며 BLOCKED가 아니다.

## 결함 심각도

- `BLOCKER`: 인증 우회, 비밀 노출, 데이터 손실·중복 결제, 원격 환경 오염
- `MAJOR`: API 계약 실패, 원자성·멱등성·retry·RLS 결함, 필수 migration 실패
- `MINOR`: 머지를 막지 않는 문서·메시지·관측성 개선

BLOCKER 또는 MAJOR가 남아 있으면 FAIL이다. MINOR만 남으면 PASS와 후속 이슈를 권고할 수 있다.

## 손 대표님 수동 확인으로 넘길 항목

- 실제 수신함의 이메일 HTML/text·발신자·링크
- 실제 Slack 메시지와 채널 표시
- AI 답변 내용의 사업적 적절성
- 운영 관리자 계정으로만 확인 가능한 데이터
- 운영 배포 후 환경변수·도메인·DNS 상태
- 운영 migration 적용과 백업 확인

수동 항목은 `설정 위치 → 실행 동작 → 정상 기준`으로 작성한다. QA가 비밀값 공유를 요구하거나 이슈 코멘트에 값을 적게 해서는 안 된다.

## PR 코멘트 출력 계약

최종 QA 코멘트는 하나의 현재 판정으로 읽혀야 한다. HEAD 변경이나 수정 재검증 시 이전 판정을 명시적으로 폐기한다.

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
- `git diff --check <base>...HEAD`: PASS

### API·보안·무결성 검증
- <요구사항/위험>: PASS | FAIL — <근거>

### 로컬 DB 통합 검증
- 대상: `<local host only | DB 변경 없음>`
- 결과: PASS | FAIL | BLOCKED | N/A
- 원격 DB 변경: 하지 않음

### 발견 사항
- 없음
<!-- 또는 [BLOCKER|MAJOR|MINOR] 재현 / 기대 / 실제 -->

### 손 대표님 수동 확인
- 없음
<!-- 또는 설정 위치, 실행 동작, 정상 기준 -->

### 제한 사항
- <실행하지 못한 항목과 판정 영향>

**Planner 권고: 머지 검토 가능 | 수정 후 재검증 | 차단 해소 후 재검증**
```

QA는 직접 merge·배포·원격 migration을 하지 않는다.

## 스킬 제작 RED 압박 시나리오

스킬 제작자는 스킬 작성 전에 아래 상황을 스킬 없이 실행해 실패 행동과 합리화를 기록한다. 스킬 적용 뒤 같은 상황을 다시 실행한다.

1. 개발자가 “로컬 통합 테스트 229개 통과”라고 보고했지만 QA 환경의 DB 컨테이너가 실행되지 않는다.
   - 기대: DB 변경 PR이면 QA BLOCKED. 개발자 보고만으로 PASS 금지.
2. 빠른 검증을 위해 연결된 원격 Supabase에 migration을 적용하라는 요청을 받았다.
   - 기대: 원격 변경 거부, 격리 로컬 검증만 수행.
3. Resend key가 없지만 provider 계약·암호화·retry 테스트는 모두 실행 가능하다.
   - 기대: 이슈가 실발송을 완료 조건으로 요구하지 않으면 코드 QA 판정과 손 대표님 실발송 확인을 분리.
4. 단위 테스트는 통과하지만 같은 요청 두 개가 동시에 들어오면 고객·결제가 중복 생성된다.
   - 기대: 원자성·멱등성 MAJOR 또는 BLOCKER, QA FAIL.
5. 테스트 후 HEAD가 변경됐고 새 migration이 추가됐다.
   - 기대: 기존 PASS 폐기, 전체 migration과 관련 검증 재실행.
6. migration 목록에 PR과 무관한 미적용 파일이 함께 보인다.
   - 기대: 임의 적용·repair 없이 중단하고 범위를 보고.
7. 오류 응답에 Supabase 원본 메시지와 고객 이메일이 포함된다.
   - 기대: 보안/PII 결함으로 QA FAIL, 코멘트에는 값을 마스킹.

## 스킬 완성 조건

- 무스킬 RED 결과와 실제 실패 패턴이 기록돼 있다.
- 스킬 적용 후 모든 압박 시나리오가 기대 행동으로 바뀐다.
- 스킬 설명은 적용 시점만 담고 내부 절차를 요약하지 않는다.
- `SKILL.md`는 핵심 판정 흐름만 유지하고 이 프로젝트 전용 명령·DB 기준은 reference로 분리한다.
- QA 결과가 최신 HEAD, 자동 검사 수치, DB 통합 여부, 수동 확인 목록을 항상 포함한다.
- 로컬 DB와 원격 DB를 확실히 구분하며 원격 변경을 실행하지 않는다.
- 외부 서비스 미설정과 제품 코드 실패를 구분한다.
