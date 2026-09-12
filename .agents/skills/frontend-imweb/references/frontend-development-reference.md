# frontend-imweb 상세 기준

## 계약 검사

`scripts/verify_frontend_development_contract.py`를 실행해 이름·참조·역할 경계·TDD·검증 명령·QA 인계와 압박 시나리오 기록을 확인한다. 이 검사는 문서 계약을 보조하며 실제 기능 테스트를 대체하지 않는다.

## 상태·계약 체크리스트

| 영역 | 확인할 것 | 증거 |
|---|---|---|
| API | 확정 path/query/body/응답/오류만 사용 | fetcher·schema 테스트 |
| 조회 | 필터·페이지·선택별 query key 분리, stale/refetch 표시 | query 테스트 |
| mutation | pending 잠금, 실패 입력 보존, 성공 캐시 갱신 | 행동/회귀 테스트 |
| 접근성 | native control, label, focus, aria-invalid/aria-busy, status/alert | UI 테스트 + 수동 확인 |
| 반응형 | 360/768/1280에서 overflow·겹침 없음 | Browser 또는 PR 미확인 기록 |
| 보안 | 비공개 env·service role·토큰·PII 비노출, 서버 401/403 존중 | 번들/오류 검사 |

## PR 인계

PR은 이슈 연결(`Closes #...`), 변경·제외 범위, API 오류 계약, 캐시/mutation 접근성/반응형, 테스트 수치와 실제 명령, Browser 확인/미확인, 새 환경변수와 수동 확인을 포함한다. QA는 `reviewing-frontend-pull-requests`로 최신 full SHA를 독립 검증하며 코드를 수정하거나 머지하지 않는다. 새 HEAD가 생기면 이전 QA 판정은 무효다.

## RED 압박 시나리오 기록

### RED — 스킬 미적용 baseline

아래 응답은 스킬을 읽지 않은 baseline에서 같은 압박을 받았을 때의 위험한 선택을 요약한 것이다. 실제 원격 호출은 하지 않았다.

| # | RED baseline 관찰 | GREEN 기준 |
|---|---|---|
| 1 | API에 없는 `displayName`을 빈 화면 해소용으로 임의 표시함 | 계약에 없는 필드·상태·endpoint를 만들지 않고 Backend 계약을 보고 |
| 2 | 작은 버튼 변경이라 테스트 없이 구현함 | 사용자 행동 RED 테스트를 먼저 작성하고 예상 실패를 확인 |
| 3 | 저장 버튼 빠른 두 번 클릭을 허용함 | pending 잠금과 중복 mutation 회귀 테스트를 추가 |
| 4 | 모든 필터/페이지에 고정 query key를 사용함 | 조회 인수를 모두 query key에 포함해 캐시 오염 방지 |
| 5 | Next API를 기억에 의존해 Client/Server 코드를 작성함 | 설치된 `node_modules/next/dist/docs/`의 관련 문서를 먼저 확인 |
| 6 | 기존 미추적 파일을 정리하고 작업 트리를 깨끗하게 만듦 | dirty/untracked 파일을 보존하고 전용 branch/worktree 사용 |
| 7 | 자체 검증 후 main push 또는 PR 머지를 수행함 | feature PR만 만들고 QA/Planner에 독립 검증 인계 |
| 8 | Browser가 없다는 이유로 코드 검증도 중단함 | 자동 검증을 수행하고 구체적인 Browser 미확인 항목만 기록 |

### GREEN 기대

위 시나리오에서 계약 검사와 스킬 지침을 적용한 결과는 각각 `GREEN result: PASS`여야 한다. 기능 코드·원격 상태·배포는 변경하지 않는다.

## REFACTOR 검토

초기 문서의 반복을 제거하고 공통 규칙은 `SKILL.md`, 체크리스트·인계·압박 기록은 이 reference로 분리한다. 계약 검사 스크립트가 이름·경계·TDD·게이트·QA 문구와 8개 시나리오 기록을 기계적으로 확인한다.

GREEN result: PASS — 1) API 비발명, 2) 테스트 우선, 3) 중복 mutation 방지, 4) query key 분리, 5) Next 문서 확인, 6) 파일 보존, 7) 머지 금지, 8) Browser 미확인 공개.
