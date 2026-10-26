# #39 AI 제안서·계약서 초안 API

## 범위와 안전 계약

기존 `assertAiEnv`의 AI_PROVIDER/AI_API_KEY/AI_MODEL/선택 AI_BASE_URL만 재사용한다. 새 공급자·유료 서비스·환경변수는 추가하지 않는다. 실제 공급자 요금/무료 한도는 기존 계정 정책을 따른다. 로컬 QA는 fake fetch만 사용한다.

문서는 기술적 배경·목표·작업 범위의 **검토용 초안**이다. 서버가 reviewOnly=true와 검토 안내, price/schedule/legal 세 확인 질문을 항상 생성한다. 경제·일정·법률 문구를 본문 필드에서 보수적으로 차단한다. 이 검사로 모든 자연어의 의미나 법적 적합성을 보증할 수 없으므로 배포 후에도 사람의 검토가 필수다. 승인·서명·발송·효력 확정 기능은 없다.

프로젝트 이름/설명, 고객 이름/회사, 공개 서비스·가격·기간·FAQ를 DB에서 조회해 최초 요청의 근거 snapshot으로 보관한다. 공개 자료는 각각 sort_order/id 순 최대 30개이며 전체 context가 64KiB를 초과하면 거부한다. 이메일·전화·프로젝트 메모·원문 AI prompt는 따로 저장하거나 로그로 출력하지 않는다. 프로젝트 설명/FAQ 자체에 개인정보가 입력돼 있으면 공급자 입력에도 포함될 수 있으므로 운영자는 해당 입력을 검토해야 한다.

`references`의 계약 금액·희망 날짜는 기존 DB 값이며 confirmed=false다. 제안된 가격·일정의 확정값이 아니다. 생성/편집된 문서 버전에도 이 참조 정보를 분리해 보관한다. 법적 조건은 고정 확인 질문으로만 취급한다. AI가 출력한 값으로 가격·일정·확정 상태를 DB에 변경하지 않는다.

## API

관리자 쿠키 인증. 공통 Origin/JSON 검증이 적용되고 각 handler도 인증을 본문보다 먼저 확인한다. 모든 성공 응답은 private, no-store다. 반환값은 기존 `{data: ...}` / `{error:{code,...}}` envelope를 따른다.

`/api/admin/projects/{id}/documents`:

- GET `?type=proposal&page=1&pageSize=20`: 현재 document, content 없는 버전 목록(버전 역순), pagination, 최근 job 최대 20개. proposal/contract 필수, pageSize 1~50.
- GET `?type=contract&version=1`: 해당 불변 버전의 content와 source/작성 시각. version 지정 시 페이지 인자는 사용하지 않는다.
- POST `{type,requestKey,retry?:false}`: 생성/재생성. 매 새 생성은 새 UUID requestKey. 성공 201, 완료된 동일 키 재호출 200(추가 AI 호출 없음), 처리 중인 동일 키 202. 실패 키는 retry=true 명시 전 409 DOCUMENT_RETRY_REQUIRED.
- PATCH `{type,requestKey,expectedRevision,content:{title,summary,scopeItems}}`: 편집 저장. 서버 소유 안내/확인 필드·references는 요청으로 덮어쓸 수 없다. 동일 키/동일 내용 재호출은 같은 버전을 반환한다. 요청 본문 최대 32KiB.

GET의 document.revision은 현재 편집본의 기준 버전이다. version_count는 AI 생성 이력까지 포함하므로 두 값은 다를 수 있다. 문서가 없으면 document=null, versions=[]다. 아직 생성 중인 최초 문서는 revision=0/content=null이다. provider 실행 결과를 받는 POST는 최대 20초 timeout을 사용한다. 모델 응답은 128KiB 및 2,500 max_tokens로 제한하고 허용된 HTTPS 공급자 host로만 보낸다. custom은 운영에 이미 설정된 AI_BASE_URL host만 사용한다. redirect는 거부한다.

## 버전·재시도·동시성

- 현재 편집본(`project_documents`), 불변 생성/수동 저장 버전(`project_document_versions`), 생성 요청/시도 이력(`project_document_jobs`)을 분리한다.
- 생성 요청 등록·context snapshot·lease 발급은 DB transaction이다. 동일 키는 하나의 job만 만든다.
- 동시에 문서 하나는 활성 lease 하나, 관리자당 2개, 전체 3개, 관리자당 시간당 새 job 10개까지다. retry는 같은 job에서 최대 3회이며 새 job 한도를 우회하는 무제한 재시도는 없다. 실제 provider 과금의 절대 상한을 보장하는 결제 시스템은 아니다.
- 실패는 AI_NOT_CONFIGURED/AI_CONFIGURATION_INVALID/AI_PROVIDER_FAILED/AI_OUTPUT_INVALID 고정 코드로만 기록한다. 모델(설정값)·공급자·입출력 토큰·시도별 오류/시각은 job history에 보관한다. 유효 출력 파싱 전에 실패하면 token은 null일 수 있다.
- 처리 lease는 120초. 중단된 요청은 같은 키+retry=true로 만료 후 회수한다. 이전 lease의 응답은 저장할 수 없다. 설정 오류/실패는 원인 해소 후 명시적 재시도한다.
- HTTP 응답 유실이나 완료 저장 실패 직후에는 GET으로 job을 확인한다. processing이면 lease가 끝나기 전에 재시도해도 provider를 또 호출하지 않는다. lease 만료 후 재시도는 provider를 다시 호출할 수 있다(이전 provider 성공 결과를 복구할 수 없으므로 중복 비용 가능). 외부 실발송은 없다.
- 생성 중 수동 편집이 저장되면 AI 결과는 applied=false인 새 이력으로만 저장하고 현재 편집본을 덮어쓰지 않는다. 원하면 그 버전을 조회한 후 새 requestKey/현재 revision으로 수동 저장한다.
- 수동 저장 expectedRevision 충돌은 409이며 버전/현재본 모두 변경하지 않는다. 같은 requestKey를 생성·수동 저장 사이에 재사용하면 409다.
- DB 쓰기는 관리자 검사 RPC만 허용하고 버전 UPDATE/DELETE 권한은 authenticated에 주지 않는다. RLS는 비관리자에게 행을 노출하지 않는다. raw job context와 lease는 직접 조회할 수 없으며 공개 RPC 출력에서도 제거한다.

주요 오류: 401/403 인증/인가, 400 VALIDATION_ERROR/DOCUMENT_INPUT_INVALID, 404 DOCUMENT_NOT_FOUND, 409 DOCUMENT_REVISION_CONFLICT/DOCUMENT_REQUEST_CONFLICT/DOCUMENT_BUSY/DOCUMENT_RETRY_EXHAUSTED, 429 DOCUMENT_GENERATION_LIMIT(+Retry-After), 413/415 본문 크기/JSON, 502 provider/출력 오류, 503 AI 미설정/구성 오류. DB/provider 원문과 stack을 응답·로그에 넣지 않는다.

## 로컬 검증

Node .nvmrc, Docker Desktop, Supabase CLI, 빈 56841~56844 포트가 필요하다.

```bash
nvm use
bash scripts/test-project-documents-local.sh
npm test
npm run lint
npm run type-check
npm run build -- --webpack
```

스크립트는 별도 임시 project ID에 전체 migration을 처음부터 적용하고 fixture를 만들며, finally에서 행과 사용자를 지우고 종료 시 전용 컨테이너/볼륨을 정리한다. 원격/linked 플래그는 없다. fixture 실패 후에도 만들어진 row를 정리한다. 테스트 중 다른 프로젝트 Docker 컨테이너는 정지하지 않는다.

검증 항목: 관리자/비관리자/anon, API auth-first/본문 제한, provider 성공/실패/지원하지 않는 조건 거부, 실패 후 retry, 동일 키 멱등, 병렬 claim/편집 충돌, 오래된 lease 거부/회수, 원자 finalize rollback, 이전 버전 불변, 생성 중 편집 보존, 두 문서 유형 분리, 메타데이터/비밀 비노출, 비용 동시성 제한. 일반 npm test의 DB skip은 이 검증을 대체하지 않는다.

새 migration: `202610260001_project_documents.sql`. 로컬만 적용한다. 원격 DB 적용·배포·머지는 별도 승인 전 금지다. 기존 프론트엔드 기능은 변경하지 않는다.
