---
name: frontend-imweb
description: Use when implementing React or Next.js frontend work in the connecting-space imweb repository, including UI, forms, client state, React Query, accessibility, responsive layouts, or API-connected screens.
---

# imweb 프론트엔드 개발

이 스킬은 확정된 이슈와 API 계약을 사용자 관찰 가능한 React/Next.js UI로 구현하고, 독립 QA가 검증할 수 있는 feature PR로 인계할 때 사용한다. 프론트엔드 UI와 클라이언트 상태만 담당하며 백엔드·원격 DB(remote DB)·배포·PR 머지는 담당하지 않는다.

## 작업 시작

- 이슈 번호·사용자 흐름·완료 조건·제외 범위와 선행 Backend의 API 계약(필드·상태·endpoint·오류)을 확인한다.
- `AGENTS.md`, 현재 base/브랜치, 주변 UI·query key·schema·테스트 패턴을 읽는다.
- Next.js API, Server/Client 경계, 캐싱 또는 빌드 설정을 건드리기 전 설치 버전의 `node_modules/next/dist/docs/` 관련 문서를 읽고 deprecation을 따른다.
- 최신 base 기반 전용 branch/worktree를 사용하고 기존 dirty/untracked 파일은 보존한다.
- 계약이 부족하면 필드·상태·endpoint를 발명하거나 mock으로 확정하지 말고 필요한 Backend 계약을 구체적으로 보고한다.

## RED → GREEN → REFACTOR

1. 사용자 행동을 설명하는 실패 테스트를 먼저 작성하고 예상 원인으로 RED가 되는지 확인한다.
2. API 계약에 맞는 최소 구현으로 GREEN을 만든다. 정상·빈 상태·로딩·백그라운드 갱신·오류/재시도·401/403·입력 검증·서버 충돌·pending/중복 클릭·실패 후 입력 보존·성공 후 캐시 일관성을 구현한다.
3. 관련 회귀·경계 테스트를 통과시킨 뒤 중복 로직과 상태 경계를 REFACTOR한다. 문자열 존재만 검사하는 테스트로 실제 행동을 대신하지 않는다.

## UI·보안 경계

- 360px/768px/1280px에서 잘림·겹침·가로 스크롤을 피하고 semantic HTML/native control, label·오류 연결, 보이는 focus, 키보드 순서와 aria 상태를 제공한다.
- 모든 목록 조회 인수를 query key에 포함하고 mutation pending 중 중복 요청을 잠근다. 성공 시 관련 목록·상세 캐시를 갱신한다.
- 서버 응답에 없는 모델명·상태·계산값을 임의 표시하지 않는다. `NEXT_PUBLIC_`가 아닌 환경변수, service role key, webhook·승인 토큰·고객 PII를 클라이언트 번들·로그·오류에 넣지 않는다.
- UI 숨김을 권한 검사로 간주하지 말고 서버의 401/403을 안전한 메시지와 재시도로 처리한다.

## 자체검증과 인계

PR 직전 최신 HEAD에서 다음을 실행하고 실제 pass/skip 수를 기록한다. Node.js 20.9 이상을 사용한다.

```bash
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check <base>...HEAD
```

PR에는 `Closes #<issue>`, 사용자 흐름·제외 범위, 사용 endpoint/오류 계약, 캐시·mutation·접근성·반응형 동작, 명령과 수치, Browser 확인/미확인 항목, 새 환경변수와 수동 확인을 적는다. QA 독립 판정을 대신 작성하지 않는다.

QA 인계 문구:

```markdown
PR #<number> 최신 HEAD `<full-sha>`를 `reviewing-frontend-pull-requests`로 검증해 주세요.
이슈 완료 조건과 정상·빈 상태·오류·재시도·중복 클릭·캐시·반응형·접근성을 확인하고 PR에 PASS/FAIL/BLOCKED를 남겨 주세요. 코드는 수정하거나 머지하지 마세요.
```

QA FAIL은 모든 항목을 이해한 뒤 같은 브랜치에서 수정하고 새 HEAD로 자체검증 후 재검증을 요청한다. 원격 DB, migration, RPC, 서버 worker/provider, 운영 배포, PR 머지는 하지 않는다. 상세 절차와 RED/GREEN 기록은 [frontend-development-reference.md](references/frontend-development-reference.md)를 현재 작업에 필요한 부분만 읽어 참조한다.
