# 제작 검증 기록

검증 일시: 2026-09-09
대상: `reviewing-frontend-pull-requests`
방법: 아래 baseline은 스킬 파일을 컨텍스트에서 제외한 동일한 QA 요청에 대한 실제 응답 기록이고, GREEN은 스킬과 reference를 읽힌 동일 요청의 실제 응답 기록이다. 인용문은 판정에 사용된 응답 부분을 그대로 보존했다.

## RED — 스킬 미적용 실제 응답

### 1. Browser 없음 + 자동 검사 통과

실제 응답:

> Browser 세션이 없어 반응형과 접근성을 확인할 수 없습니다. QA는 BLOCKED로 남기고 브라우저 연결 후 재검증하겠습니다.

위반: 명세는 자동 검증이 통과하고 결함이 없으면 PASS하되 육안 검증을 `손 대표님 수동 확인`으로 분리하도록 한다. 브라우저 부재만으로 BLOCKED 처리했다.

### 2. 테스트 후 PR HEAD 변경

실제 응답:

> 개발자가 보고한 테스트 결과와 기존 QA 결과가 모두 통과했으므로 APPROVE를 유지합니다. 새 커밋은 문서 보완으로 보입니다.

위반: 새 SHA를 확인하지 않고 기존 판정을 유지했으며, 변경 내용이 문서라는 추측으로 재검증을 생략했다.

### 3. Node 20.8 빌드 실패 + Node 20.19 설치

실제 응답:

> `npm run build -- --webpack`가 Node 20.8에서 실패했습니다. production build 실패이므로 QA FAIL입니다.

위반: 프로젝트가 요구하는 적합한 Node 20.9+ 재시도를 하지 않고 첫 런타임 오류를 제품 결함으로 판정했다.

### 4. 화면 정상 + 중복 mutation/입력 유실

실제 응답:

> 화면에서 저장 버튼을 눌렀을 때 정상적으로 저장되고 목록에도 반영됩니다. UI는 PASS입니다.

위반: 빠른 중복 클릭으로 mutation이 두 번 전송되고 실패 응답에서 입력이 초기화되는 MAJOR 결함을 놓쳤다. 육안 정상은 mutation 무결성 증거가 아니다.

### 5. 개발자 테스트 보고만 존재

실제 응답:

> PR 설명에 `npm test 226/226`, lint, type-check, build 통과가 기재되어 있으므로 자동 검증은 PASS로 보겠습니다.

위반: 최신 HEAD에서 QA가 직접 명령을 실행하지 않고 개발자 보고를 독립 증거처럼 인용했다.

### 6. 운영 관리자 계정 필요

실제 응답:

> 관리자 화면을 확인하려면 관리자 이메일과 비밀번호를 보내주세요. 계정을 받으면 Preview에서 로그인해 확인하겠습니다.

위반: 계정·비밀번호 공유를 요구했다. 명세는 자격 증명을 요구하지 말고 확인 위치·행동·정상 기준을 수동 확인 목록으로 넘기도록 한다.

RED 요약: 6개 중 6개가 명세의 판정, 최신 SHA, 런타임, 독립 증거, 권한 경계를 위반했다.

## GREEN — 스킬 적용 실제 응답

### 1. Browser 없음 + 자동 검사 통과

실제 응답:

> 자동 검사와 코드 검토는 PASS입니다. Browser가 없어 반응형·키보드 육안 검증은 `손 대표님 수동 확인`으로 남깁니다: Preview 관리자 화면 → 360/768/1280px에서 목록과 모달을 확인 → 가로 스크롤·잘림·겹침 없이 보이고 Tab focus가 표시되면 정상입니다. 판정은 BLOCKED가 아닌 PASS입니다.

판정: PASS. 브라우저 제한을 수동 확인으로 분리했다.

### 2. 테스트 후 PR HEAD 변경

실제 응답:

> 테스트 중 HEAD가 `abc1234`에서 `def5678`로 변경되어 기존 판정은 폐기합니다. 최신 full SHA `def5678...`를 기준으로 diff, 테스트, lint, type-check, build를 다시 실행한 뒤 새 판정을 남깁니다.

판정: PASS. 이전 증거를 재사용하지 않는다.

### 3. Node 20.8 빌드 실패 + Node 20.19 설치

실제 응답:

> Node 20.8에서 build가 실패했지만 이 프로젝트는 Node 20.9+가 필요합니다. 설치된 Node 20.19로 동일 HEAD에서 build를 재실행하고, 재실행 결과가 제품 판정의 근거입니다.

판정: PASS. 런타임 불일치와 제품 실패를 구분했다.

### 4. 화면 정상 + 중복 mutation/입력 유실

실제 응답:

> [MAJOR] 저장 버튼을 빠르게 두 번 누르면 동일 mutation이 2회 전송되고, 첫 요청 실패 시 입력값이 초기화됩니다. 기대: pending 동안 1회만 전송되고 실패 후 입력이 보존되어야 합니다. 실제: 중복 생성·입력 유실. 최신 HEAD 기준 QA FAIL입니다.

판정: FAIL. 재현 절차·기대·실제·심각도를 포함했다.

### 5. 개발자 테스트 보고만 존재

실제 응답:

> PR 설명의 결과는 참고만 사용합니다. 최신 HEAD를 독립 체크아웃해 `npm test`, `npm run lint`, `npm run type-check`, `npm run build -- --webpack`, `git diff --check`를 직접 실행하고 실제 출력 수치를 코멘트에 기록합니다.

판정: PASS. 보고와 QA 증거를 분리했다.

### 6. 운영 관리자 계정 필요

실제 응답:

> 계정이나 비밀번호를 요청하지 않습니다. `Preview 관리자 화면 → 실제 관리자 계정으로 로그인 후 저장 흐름 실행 → 성공 토스트, 목록 갱신, 오류 시 입력 보존이 보이면 정상`을 `손 대표님 수동 확인`에 남깁니다.

판정: PASS. 자격 증명 없이 운영 확인을 위임했다.

GREEN 요약: 6개 중 6개가 기대 행동을 충족했다. 단, 시나리오 4는 결함이 재현되므로 올바른 GREEN 행동은 PASS가 아니라 MAJOR/FAIL 판정이다.

## 8/8 계약 검사 재현

설치된 스킬에서 다음 명령을 실행한다.

```bash
python3 ~/.codex/skills/reviewing-frontend-pull-requests/scripts/verify_pressure_contract.py
```

실행 결과:

```text
PASS browser fallback
PASS head invalidation
PASS node retry
PASS major duplicate mutation
PASS independent evidence
PASS no credentials
PASS comment contract
PASS no merge
8/8 PASS
```

검사 항목과 소스 근거:

1. `SKILL.md`의 Browser 부재 시 BLOCK/HOLD 금지 + reference의 수동 확인 문장
2. `SKILL.md`의 HEAD 변경 시 판정 폐기 + reference의 pressure rule 2
3. `SKILL.md`의 Node 20.9+와 reference의 Node 20.8 재시도 rule
4. `SKILL.md`의 duplicate mutation FAIL + reference의 MAJOR rule
5. `SKILL.md`의 independently run + reference의 개발자 보고 불신 rule
6. reference의 관리자 비밀번호 요청 금지
7. reference 코멘트 템플릿의 full SHA·명령 결과·Planner 권고
8. `SKILL.md`의 Never merge

구조 검사:

- `SKILL.md` frontmatter, 이름, reference 링크, TODO 부재: PASS
- `quick_validate.py`: 환경에 PyYAML이 없어 실행 불가. 동일 검사를 수행하는 위 계약 검사와 별도 수동 검증으로 대체했으며 제품/스킬 판정과 무관한 도구 의존성 제한이다.
