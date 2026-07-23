# 1주차 문의·관리자 흐름 회귀 검증

## 담당 역할

QA 에이전트

## 결론

APPROVE

## 검증 대상

- Issue: #8 `[QA][ready] 1주차 문의·관리자 흐름 회귀 검증`
- 기준 브랜치: `origin/main`
- 기준 커밋: `4de9cef feat: 문의 고객 프로젝트 전환 UI 추가 (#14)`
- 검증 일시: 2026-07-23 KST

## 테스트 환경

- 격리 worktree: `/private/tmp/imweb-week1-qa`
- Node: `20.19.0`
- 실행 서버: `http://127.0.0.1:3108`
- Supabase 연결: 로컬 `.env.local` 기반
- 비고: 원본 `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`이 `/rest/v1/` 경로를 포함한 REST endpoint 형태라, QA worktree의 임시 `.env.local`에서만 Supabase project origin URL로 정규화해 실행했다. 원본 파일과 코드에는 변경하지 않았다.

## 실행한 명령과 결과

| 명령 | 결과 |
| --- | --- |
| `git fetch origin main` | 성공. `origin/main` 최신화 |
| `git worktree add -b qa/week-1-regression /private/tmp/imweb-week1-qa origin/main` | 성공. 최신 main 기준 QA 브랜치 생성 |
| `npm ci --prefer-offline` | 성공. 606 packages installed |
| `npm run type-check` | 성공. `tsc --noEmit` exit 0 |
| `npm run lint` | 성공. `eslint` exit 0 |
| `npm test` | 성공. 3 suites, 11 tests, fail 0 |
| `npm run build` | 최초 샌드박스 실행은 Turbopack 포트 바인딩 제한으로 실패. 승인 권한 재실행 성공 |
| `npm run dev -- -p 3108` | 성공. `http://localhost:3108` ready |
| QA HTTP 회귀 스크립트 | 성공. 공개 문의 -> 관리자 확인 -> 상세 조회 -> 상태 변경 -> 고객/프로젝트 전환 API 흐름 통과 |

## 자동 테스트 상세

`npm test` 결과:

- `admin inquiry list formatting`: 6개 테스트 통과
- `inquiry conversion payloads`: 4개 테스트 통과
- `createInquiryInputFromFormData`: 1개 테스트 통과
- 총계: 3 suites, 11 tests, pass 11, fail 0

`npm run build` 결과:

- Next.js 16.2.11 Turbopack production build 성공
- static pages: 13개 생성
- 확인된 주요 라우트:
  - `/`
  - `/admin`
  - `/admin/login`
  - `/api/inquiries`
  - `/api/admin/inquiries`
  - `/api/admin/inquiries/[id]`
  - `/api/admin/customers`
  - `/api/admin/customers/[id]`
  - `/api/admin/projects`
  - `/api/admin/projects/[id]`

## 1주차 핵심 흐름 검증

| 항목 | 결과 | 실제 확인 |
| --- | --- | --- |
| 공개 홈 접근 | PASS | `GET /` -> 200 |
| 미인증 `/admin` 접근 차단 | PASS | `GET /admin` -> 307, `/admin/login?next=%2Fadmin` |
| `/admin/login` 접근 가능 | PASS | `GET /admin/login` -> 200 |
| 공개 문의 등록 실패 흐름 | PASS | 빈 payload `POST /api/inquiries` -> 400 |
| 공개 문의 등록 성공 흐름 | PASS | 유효 payload `POST /api/inquiries` -> 201 |
| 미인증 관리자 API 차단 | PASS | `GET /api/admin/inquiries` -> 401 |
| 관리자 로그인 | PASS | QA용 관리자 계정 생성 후 `POST /api/auth/login` -> 200, auth cookie 발급 |
| 인증 후 관리자 페이지 접근 | PASS | cookie 포함 `GET /admin` -> 200 |
| 관리자 문의 목록 조회 | PASS | `GET /api/admin/inquiries` -> 200, 생성한 문의 포함 |
| 관리자 문의 상세 조회 | PASS | `GET /api/admin/inquiries/{id}` -> 200 |
| 문의 상태 변경 | PASS | `PATCH /api/admin/inquiries/{id}` status `contacted` -> 200 |
| 고객 생성 | PASS | `POST /api/admin/customers` -> 201 |
| 프로젝트 생성 | PASS | `POST /api/admin/projects` -> 201 |
| 문의 전환 상태 반영 | PASS | `PATCH /api/admin/inquiries/{id}` status `converted` -> 200 |
| 고객 목록 확인 | PASS | `GET /api/admin/customers` -> 200, 생성한 고객 포함 |
| 프로젝트 목록 확인 | PASS | `GET /api/admin/projects` -> 200, 생성한 프로젝트 포함 |
| QA 데이터 정리 | PASS | project, customer, inquiry, admin row, auth user 삭제 성공 |

## 발견한 문제

필수 수정 사항 없음.

## 참고 사항

- HTTP 회귀 검증은 실제 Supabase 연결을 사용했으며, QA용 관리자 계정과 문의/고객/프로젝트 데이터를 생성한 뒤 삭제했다.
- 브라우저 자동화 도구 없이 HTTP/API 기준으로 핵심 연결 흐름을 검증했다. UI 클릭 단위 e2e가 필요하면 Playwright 브라우저 설치와 테스트 시나리오 추가가 별도로 필요하다.
- `npm run build`는 일반 샌드박스에서 Turbopack 내부 포트 바인딩 제한으로 실패했으나, 승인 권한 재실행에서 성공했다. 코드 빌드 실패로 보지 않는다.

## 필수 수정 사항

없음.

## 권장 개선 사항

- `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`은 Supabase REST endpoint가 아니라 project origin URL 형태여야 한다. 예: `https://<project-ref>.supabase.co`
- 1주차 핵심 흐름을 CI에서 반복 검증하려면 이번 HTTP 회귀 스크립트를 정식 테스트로 편입하는 것을 권장한다.
- 문의 전환은 현재 UI/API 조합으로 동작하지만, 장기적으로는 서버 단일 전환 API와 트랜잭션/idempotency 처리를 추가하면 더 견고하다.

## Planner에게 전달할 최종 의견

1주차 공개 문의·관리자 흐름은 최신 main 기준으로 회귀 검증을 통과했다. 필수 수정 사항은 없으며, Planner가 최종 승인과 merge를 진행하면 된다.
