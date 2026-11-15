# #42 아임웹 코드 위젯 생성 API 검증

담당 역할: 백엔드 에이전트

## 계약과 사용 순서

관리자 세션 쿠키 또는 기존 관리자 Bearer 인증을 사용한다. 쿠키 POST는 기존 Proxy의 허용 Origin 정책을 통과해야 한다. 모든 응답은 no-store이며 성공은 private, no-store다. 프론트엔드 UI·직접 실행·아임웹 업로드는 이 PR에 포함하지 않는다.

`POST /api/admin/projects/{uuid}/widgets`, `Content-Type: application/json`:

```json
{
  "requestKey": "22222222-2222-4222-8222-222222222222",
  "retry": false,
  "requirements": {
    "industry": "카페",
    "purpose": "브랜드 소개",
    "targetAudience": "방문 예정 고객",
    "mood": "차분하고 따뜻함",
    "colors": ["#123456"],
    "sections": ["소개", "특징"],
    "interactions": ["버튼을 누르면 설명 영역 강조"]
  }
}
```

- 문자열 4개: trim 후 각 1~500자. colors: hex 6자리 1~8개, sections: 각 1~500자 1~20개, interactions: 각 1~500자 0~10개. 알 수 없는 필드는 거부한다.
- 본문 16KiB, requirements JSON 12KiB까지. DB는 공백을 포함한 jsonb 텍스트 크기도 검사하므로 한계에 가까운 입력은 더 일찍 거부할 수 있다.
- 프로젝트 존재를 확인한 후 요구사항만 공급자 컨텍스트로 보낸다. 고객 연락처·메모·문서·가격·프로젝트 설명을 자동 첨부하지 않는다. 요구사항에는 공개 가능한 내용만 입력한다. 사용자가 직접 쓴 개인정보를 판별하거나 제거하는 기능은 없으므로 Frontend 입력 안내가 필요하다.
- 최초 완료는 201 `{data: job}`, 동일 키/입력 완료 재호출은 200. 새 키는 재생성하여 새 버전을 남긴다. 완료 응답의 `version`으로 GET 한다. 처리 중인 같은 키는 202. 내부 lease/context는 반환하지 않는다.
- 실패한 같은 키는 409 `WIDGET_RETRY_REQUIRED`. 같은 입력과 `retry:true`로 명시적 재시도한다. 최대 3회이며 초과 시 409 `WIDGET_RETRY_EXHAUSTED`. 같은 키/다른 입력은 409 `WIDGET_REQUEST_CONFLICT`.
- 처리 중 다른 키는 409 `WIDGET_BUSY`. 120초 lease가 지난 기존 작업은 동일 키/동일 입력/`retry:true`로 회수한다. 이전 lease finalize는 거부한다. 최종 저장 실패도 이 방식으로 복구한다. 자동 공급자 재호출·백그라운드 worker는 없다.
- 이 기능 동시 작업 전체 3개/관리자 2개, 관리자 신규 작업 시간당 10개. 초과 429 `WIDGET_GENERATION_LIMIT`, `Retry-After: 60`은 재평가 권고이며 60초 후 통과를 보장하지 않는다. 재시도는 기존 작업당 최대 3회로 별도 제한한다. 공급자 timeout 20초·출력 max_tokens 6000이다.
- 기존 `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`만 사용한다. 새 환경변수/유료 서비스는 없다. 설정 없음 503 `AI_NOT_CONFIGURED`, URL 설정 실패 503 `AI_CONFIGURATION_INVALID`, 공급자 실패 502 `AI_PROVIDER_FAILED`, 부적합 출력 502 `AI_OUTPUT_INVALID`. 원문 오류·응답·URL·키는 로그/응답에 담지 않는다. Provider별 Structured Outputs 지원 및 실제 생성 품질은 mock 검증과 별개로 운영 전 수동 확인해야 한다.

`GET /api/admin/projects/{uuid}/widgets?page=1&pageSize=20`:

```text
data.widget: null 또는 {id,project_id,kind,revision,version_count,content,code}
data.widget.content: 아래 구조 명세
data.widget.code: {html,css,javascript,reviewOnly:true,reviewNotice}
data.versions: content를 제외한 버전 요약(내림차순)
data.pagination: {page,pageSize,total}
data.jobs: 최근 20개 작업(lease/context 제외, attempt history 포함)
```

`GET .../widgets?version=1`은 해당 버전 행의 `content`와 `code`를 반환한다. 미존재 프로젝트·버전은 404 `WIDGET_NOT_FOUND`. page=1~100000, pageSize=1~50. 알 수 없는/중복 query는 400이다. 요구사항은 job context에 저장하지만 HTTP 조회에서는 노출하지 않으므로 재시도할 입력은 클라이언트에서 보존한다.

## 실행 코드 경계

모델에 임의 코드를 요청하지 않는다. 아래 구조만 받아 앱과 SQL 양쪽에서 검사하고 결정적 compiler로 변환한다. 이 선택은 기능 범위를 제한해 실행 코드 안전 경계를 명확히 하기 위한 것이다.

```json
{
  "elements": [
    {"id":"intro","parentId":null,"tag":"h2","text":"소개"},
    {"id":"toggle","parentId":null,"tag":"button","text":"강조"}
  ],
  "styles": [{"targetId":"intro","property":"color","value":"#123456","active":true}],
  "interactions": [{"triggerId":"toggle","targetId":"intro","action":"toggle"}]
}
```

- 요소 1~80개, id 소문자 시작 영숫자/하이픈 최대40자, 텍스트 최대2000자. 부모가 먼저 나오는 최대10단계 트리. 허용 태그는 div/section/h2/h3/p/span/button/ul/li/strong/em, 자식을 갖는 태그는 div/section/ul/li. ul/li의 부모·자식 관계도 검사한다.
- 텍스트는 HTML escape한다. 속성 이름/이벤트/URL 입력 자체가 없고 unknown 필드는 거부한다. script/iframe/svg/math/style/link/img/form 등은 허용하지 않는다.
- 스타일 최대120개. 허용 속성은 schema의 `cssProperties`, 값은 영숫자/#/공백/점/쉼표/%/_/- 최대80자만 허용한다. 괄호·슬래시·역슬래시·세미콜론·중괄호·@·인용부호를 거부해 url()/expression()/escape/import 등 실행·외부 로딩 구문을 받지 않는다. 유효하지 않은 CSS 값은 브라우저에서 무시될 수 있다.
- JavaScript는 button 클릭 → 동일 위젯 대상 `is-active` 클래스 토글만 지원한다. 최대20개. provider 임의 JavaScript·fetch/eval/innerHTML/동적 스크립트가 실행되는 경로가 없다. 다시 삽입해도 동일 DOM에 중복 listener를 등록하지 않는다.
- HTML ID·CSS·JavaScript query는 `iw-{projectUUID}` 범위에 고정한다. 프로젝트당 하나의 위젯만 동일 페이지에 사용한다. 복수 버전을 동시에 같은 페이지에 붙이는 것은 지원하지 않는다.
- spec JSON 최대32KiB, provider 응답 최대128KiB. 기존 DB 버전도 반환 전에 재검증한다. 잘못된 저장 명세는 500 `WIDGET_STORED_CONTENT_INVALID`로 차단한다.
- 반환 코드는 검토용 초안이다. HTML/CSS/JavaScript를 분리해 복사할 수 있지만, 앱 내 임의 실행·미리보기는 구현하지 않는다. #43에서 미리보기를 만들 경우 별도 sandbox/실행 경계 검토가 필요하다. 레이아웃 품질·접근성·아임웹 테마 충돌은 운영 삽입 전 사람이 확인해야 한다.

## 로컬 재현

Node 22.23.3, Docker, Supabase CLI 필요. 운영 연결/키 없이 아래 한 명령이 임시 로컬 프로젝트 생성 → 전체 migration 적용 → local reset → 관리자·일반회원·고객·프로젝트 fixture 생성 → 통합 검증 → fixture/컨테이너 정리를 수행한다.

```bash
nvm use
bash scripts/test-widgets-local.sh
```

로컬 API URL host가 정확히 localhost 또는 127.0.0.1일 때만 fixture를 생성한다. 실패 중간에 만든 row/user도 finally에서 정리하며 컨테이너는 EXIT trap으로 정리한다. 고정 포트 56941~56944가 사용 중이면 먼저 해당 로컬 작업과 조율한다. 사용 후 남은 컨테이너를 확인하고 Docker Desktop을 종료한다.

검증 대상: 인증 우선/JSON 크기/쿼리/캐시, 안전성·구조화 provider 출력·길이·비밀 비노출, 컴파일한 JS 동작, 동일 키 동시 요청의 단일 lease, 재시도 입력 고정·상한·만료 lease 교체, 중복 finalize, 잘못된 spec의 원자적 rollback, 현재/과거 버전·페이지, 다른 관리자 finalize 거부, 일반회원 RLS·anon 차단·직접 변경 금지, 관리자/전체 동시 한도·시간당 한도. 기존 문서 DB suite도 같은 로컬 환경에서 회귀한다.

일반 자체 검증:

```bash
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check origin/main...HEAD
```

## DB와 운영 인계

`202611150001_project_widgets.sql`에 전용 3개 table과 4개 공개 RPC/2개 비공개 validator를 추가한다. 관리자 read RLS, 테이블 직접 쓰기 금지, job context/lease raw 조회 금지, fixed search_path, PUBLIC/anon execute 회수, 관리자 checked definer를 사용한다. fixture service_role만 직접 쓰기가 가능하다. 일반 관리자는 버전 수정/삭제 권한이 없다.

원격 migration·운영 계정·운영 변수·실제 고객 데이터·배포·머지는 수행하지 않는다. 머지 후 승인된 별도 작업으로 원격 migration 목록 비교 및 적용을 해야 운영에서 API를 사용할 수 있다. 기존 AI 설정을 사용하므로 실제 호출에는 기존 공급자의 사용량 정책이 적용된다. 이 PR의 테스트는 실제 AI를 호출하지 않는다.
