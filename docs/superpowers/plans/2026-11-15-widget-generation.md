# #42 코드 위젯 생성 구현 계획

목표: 프로젝트별 검토용 HTML/CSS/JavaScript 초안과 버전 이력·재시도를 관리자 API로 제공한다.

기존 문서 API의 공급자 설정 및 lease 패턴을 따른다. 임의 코드를 파서로 사후 정화하는 방식은 JS 안전성 보장이 어려워 채택하지 않는다. 허용된 구조 명세를 서버에서 코드로 변환한다. 첫 범위는 내부 요소·스타일과 클릭 클래스 토글이다. 외부 URL/임의 JS/실행 UI는 제외한다. 상세 계약은 이슈 #42의 백엔드 구현 계약 코멘트에 기록한다.

1. `tests/widget-safety.test.ts`: 구조 명세·입력·출력 경계 RED 확인 후 `src/entities/widget/schemas/widget.ts` 및 결정적 compiler 구현. 위험 태그·속성·URL·CSS·임의 JS·길이·중복 참조를 거부한다.
2. `tests/widgets-api.test.ts`: 인증 우선·읽기 캐시·에러·생성·멱등 회귀 RED 후 route/provider/finalize 구현. 설정은 기존 assertAiEnv 재사용, 20초 timeout·128KiB 응답 경계·고정 오류 코드.
3. `tests/widgets.integration.test.ts`: 로컬 fixture 자가 생성/부분 실패 cleanup. 신규 migration과 generated types에 tables/RPC/RLS, 원자적 claim/finalize·동시성·재시도·만료·한도·append-only를 구현한다. migration-from-zero에서 GREEN 확인.
4. 전체 테스트/lint/type-check/production build와 기존 문서 DB 회귀를 실행한다. QA 문서·PR에 실제 수치/운영 미적용/기능 제한을 기록하고 최신 SHA QA를 요청한다. Docker는 종료한다.

유의: 공급자 비밀/연락처는 컨텍스트에서 제외한다. 생성 요구사항은 공개 배포용 내용만 받는다. 개인정보 판별기는 제공하지 않으므로 운영 전 입력 안내가 필요하다. 코드 문자열을 앱에서 실행하지 않는다. CSRF는 기존 관리자 mutation 미들웨어의 Origin 정책을 적용한다.
