# Frontend PR #1 Review

## 너의 담당 명

QA 및 코드 리뷰 담당자

## 결론

REQUEST_CHANGES

## 검증한 PR

- PR: #1 `feat: add public and admin UI shell`
- URL: https://github.com/sonprogrammer/connecting-space/pull/1
- Head: `frontend/public-admin-ui`
- Base: `main`
- 상태: OPEN
- GitHub merge state: CLEAN
- 확인 커밋: `f4fe16241d2a2b4d3e82c449f3f6400a66898878`
- 기준 main: `9c558eeaaa3fdff56e69a1a8025c6ca8da960da9`

## 연결된 Issue

없음. `gh pr view`의 `closingIssuesReferences`가 빈 배열입니다.

## 실행한 명령과 결과

| 명령 | 결과 |
| --- | --- |
| `gh pr view --json number,title,baseRefName,headRefName,url,state,mergeStateStatus,reviewDecision,closingIssuesReferences` | 성공. PR #1, base `main`, head `frontend/public-admin-ui`, merge state `CLEAN`, 연결 Issue 없음 |
| `git fetch origin main` | 최초 실행은 `.git/FETCH_HEAD` 쓰기 제한으로 실패, 승인 권한 재실행 성공 |
| `git rev-parse FETCH_HEAD HEAD origin/main` | `FETCH_HEAD`/`origin/main` = `9c558ee...`, `HEAD` = `f4fe162...` |
| `git diff --name-status FETCH_HEAD...HEAD` | 변경 파일 없음 |
| `git diff --stat FETCH_HEAD...HEAD` | 변경 통계 없음 |
| `git show --stat --summary --name-status HEAD` | `chore: open frontend ui pr` 빈 커밋, 파일 변경 없음 |
| `npm run type-check` | 성공. `tsc --noEmit` exit 0 |
| `npm run lint` | 성공. `eslint` exit 0 |
| `npm run build` | 샌드박스 실행은 Turbopack 포트 바인딩 제한으로 실패. 승인 권한 재실행 성공, 11개 static page generation 완료 |
| `npm run dev` | 성공. 3000 포트 사용 중이라 `http://localhost:3001`로 실행 |
| `curl -I http://127.0.0.1:3001/` | 성공. `HTTP/1.1 200 OK` |
| `curl -I http://127.0.0.1:3001/admin/login` | 재현. `HTTP/1.1 307 Temporary Redirect`, `location: /?next=%2Fadmin%2Flogin` |
| `curl -s -o /tmp/imweb-session.txt -w '%{http_code}' http://127.0.0.1:3001/api/auth/session` | 성공. 미인증 요청 `401` |
| Playwright responsive smoke test | 실패. Playwright 패키지는 있으나 브라우저 바이너리가 없어 실행 불가 |

## 요구사항별 통과 여부

| 요구사항 | 결과 | 근거 |
| --- | --- | --- |
| AGENTS.md 규칙 준수 여부 | PASS | `AGENTS.md` 확인. 코드 수정은 하지 않았고, Next 16 로컬 문서 위치 및 proxy 문서 존재 확인 |
| 변경 파일 범위가 담당 범위를 벗어나지 않았는지 | PASS | main 대비 변경 파일 없음 |
| 이미 main에 반영된 코드와 충돌하지 않는지 | PASS | GitHub merge state `CLEAN`, `git diff FETCH_HEAD...HEAD` 비어 있음 |
| 타입 오류 | PASS | `npm run type-check` 성공 |
| lint | PASS | `npm run lint` 성공 |
| build | PASS | 승인 권한에서 `npm run build` 성공 |
| 기존 기능 회귀 | REQUEST_CHANGES | 관리자 로그인 페이지가 미인증 상태에서 접근 불가 |
| 공개 페이지 반응형과 주요 사용자 흐름 | PARTIAL / REQUEST_CHANGES | `/` HTTP 200 및 정적 반응형 구조는 확인. 브라우저 스크린샷 검증은 바이너리 부재로 미수행. `/admin/login` 접근 흐름 실패 |
| 보안상 문제 | PASS with note | 미인증 세션 API는 401. 관리자 보호 자체는 동작하나 로그인 페이지까지 보호하는 라우팅 문제가 있음 |
| 불필요한 패키지 또는 구조 변경 여부 | PASS | PR diff 없음 |

## 발견한 문제

### 1. 관리자 로그인 페이지가 미인증 사용자에게 열리지 않음

- 심각도: Major
- 파일: `src/proxy.ts`
- 현재 `config.matcher`가 `/admin/:path*` 전체를 보호합니다. 이 범위에 `/admin/login`도 포함되어 미인증 사용자가 로그인 화면으로 접근할 수 없습니다.
- 재현 결과: `curl -I http://127.0.0.1:3001/admin/login` → `307 Temporary Redirect`, `location: /?next=%2Fadmin%2Flogin`
- 영향: 관리자 로그인 주요 흐름이 시작되지 않습니다. 로그인 폼은 `src/app/admin/login/page.tsx`에 존재하지만 실제 미인증 사용자는 볼 수 없습니다.
- 비고: PR diff가 비어 있어 이 문제는 이번 PR에서 새로 추가된 변경은 아닙니다. 다만 손 대표님이 요청한 현재 PR 트리의 주요 사용자 흐름 검증 기준에서는 merge 전 필수 확인 사항입니다.

### 2. PR #1은 main 대비 빈 커밋임

- 심각도: Minor
- `git diff FETCH_HEAD...HEAD`와 `git show --stat HEAD` 모두 변경 파일이 없습니다.
- 영향: PR 제목은 public/admin UI shell 추가를 의미하지만 실제 merge 결과는 main에 아무 변경도 추가하지 않습니다.

## 필수 수정 사항

1. `/admin/login`은 프록시 보호 대상에서 제외해야 합니다.
   - 예: matcher를 `/admin` 및 로그인 외 하위 경로로 조정하거나, `proxy()` 내부에서 `request.nextUrl.pathname === "/admin/login"`일 때 `NextResponse.next()` 처리.
   - 수정 후 `curl -I /admin/login`이 200을 반환하고, `/admin`은 미인증 307 redirect를 유지하는지 재검증해야 합니다.

## 권장 개선 사항

1. PR이 main 대비 빈 커밋이므로, 실제 변경이 이미 main에 반영된 상태라면 PR을 닫거나 목적을 다시 정리하는 것이 좋습니다.
2. 브라우저 기반 반응형 QA를 반복 가능하게 하려면 Playwright 브라우저 설치 또는 별도 e2e 스크립트 추가를 권장합니다.
3. 관리자 로그인/보호 라우팅은 회귀 위험이 높으므로 최소 e2e 케이스를 추가하는 것이 좋습니다.

## merge 가능 여부

현재 판단: merge 보류.

GitHub merge state는 `CLEAN`이고 PR diff는 비어 있어 기술적으로는 no-op merge가 가능하지만, 현재 PR 트리 기준 주요 관리자 흐름에 실패가 재현되어 `REQUEST_CHANGES`로 보고합니다. 직접 merge하지 않습니다.

## Planner에게 전달할 최종 의견

Planner는 이 PR이 main 대비 빈 커밋임을 먼저 확인해야 합니다. 실제 기능 변경이 이미 main에 들어간 상태라면 PR을 닫는 선택지가 합리적입니다. 다만 현재 코드 기준으로 `/admin/login` 접근 불가 문제가 재현되므로, 관리자 로그인 프록시 예외 처리를 별도 수정 항목으로 잡아야 합니다.

최종 권한은 Planner에게 넘깁니다.
