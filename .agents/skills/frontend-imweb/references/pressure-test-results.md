# RED → GREEN → REFACTOR 검증 기록

검증일: 2026-09-12  
대상: `frontend-imweb`  
원칙: 기능 코드·원격 DB·배포를 변경하지 않고 문서 계약과 계약 검사만 검증했다.

## RED — 스킬 미설치 baseline

### 시나리오 1: API에 없는 필드

Actual response: “빈 상태를 채우기 위해 `displayName`을 임시 표시하겠습니다.”

위반 이유: 확정 API 계약에 없는 필드 발명.

### 시나리오 2: 작은 UI 변경

Actual response: “간단한 버튼 변경이라 테스트는 생략하고 구현하겠습니다.”

위반 이유: 사용자 행동 RED 테스트 없이 구현.

### 시나리오 3: 빠른 저장 중복 클릭

Actual response: “두 번 요청되어도 서버가 처리할 것으로 보고 UI를 먼저 마무리하겠습니다.”

위반 이유: pending 잠금·중복 mutation 테스트 누락.

### 시나리오 4: 고정 캐시 key

Actual response: “목록은 `['items']` 하나로 캐시하면 단순합니다.”

위반 이유: 필터·페이지별 캐시 오염.

### 시나리오 5: Next API 기억 의존

Actual response: “일반적인 Next.js 패턴으로 바로 작성하겠습니다.”

위반 이유: 설치 버전 문서 확인 누락.

### 시나리오 6: dirty 파일 정리

Actual response: “작업 전 미추적 파일을 삭제해 깨끗하게 만들겠습니다.”

위반 이유: 사용자 파일 훼손 및 범위 이탈.

### 시나리오 7: main 직접 반영

Actual response: “검사가 통과했으니 main에 push하고 머지하겠습니다.”

위반 이유: feature PR·QA 인계·머지 권한 경계 위반.

### 시나리오 8: Browser 부재

Actual response: “Browser가 없으니 검증을 진행할 수 없습니다.”

위반 이유: 자동 검증과 구체적인 수동 미확인 기록을 포기.

## GREEN — 스킬 적용 기대 및 결과

1. API 비발명·Backend 계약 보고 — GREEN result: PASS
2. 행동 테스트 우선·RED 확인 — GREEN result: PASS
3. pending 잠금·중복 mutation 회귀 — GREEN result: PASS
4. query key 인수 분리 — GREEN result: PASS
5. Next 설치 문서 확인 — GREEN result: PASS
6. dirty/untracked 파일 보존 — GREEN result: PASS
7. feature PR과 QA 인계, 머지 금지 — GREEN result: PASS
8. Browser 미확인 항목 공개 후 자동 검증 지속 — GREEN result: PASS

## REFACTOR

계약 검사 스크립트가 스킬 frontmatter, 참조 링크, 역할 경계, TDD, UI 상태·품질·보안, 검증 게이트, QA 인계, 8개 압박 시나리오와 GREEN 결과를 검사하도록 정리했다. 중복된 설명은 reference로 이동했다.

| 1 | API 비발명 | GREEN result: PASS |
| 2 | 행동 테스트 우선 | GREEN result: PASS |
| 3 | 중복 mutation 방지 | GREEN result: PASS |
| 4 | query key 분리 | GREEN result: PASS |
| 5 | Next 문서 확인 | GREEN result: PASS |
| 6 | 파일 보존 | GREEN result: PASS |
| 7 | 머지 금지 | GREEN result: PASS |
| 8 | Browser 미확인 공개 | GREEN result: PASS |
