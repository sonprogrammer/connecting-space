# 문의 전환 연결 무결성 및 고객·프로젝트 검색 API 설계

## 목표

문의 전환을 한 번의 원자적 작업으로 처리해 문의·고객·프로젝트의 연결 ID를 일관되게 저장하고, 관리자 화면이 사용할 검색·필터·정렬·페이지네이션 API를 제공한다.

## 범위

- 관리자 전용 `POST /api/admin/inquiries/:id/convert` 전환 API
- 고객·프로젝트 목록 API의 `q`, 상태 필터, 정렬, 페이지, pageSize
- 기존 `inquiry_id` 연결과 `converted_customer_id`/`converted_project_id` 재사용
- DB RPC migration 파일과 적용 절차 문서
- API 계약·중복 전환·검색 결과 회귀 테스트

## 전환 흐름

1. 관리자 인증 및 요청 payload를 검증한다.
2. DB 함수가 해당 문의를 `FOR UPDATE`로 잠근다.
3. 기존 `converted_customer_id`/`converted_project_id`를 조회한다.
4. 값이 없으면 기존 `customers.inquiry_id`와 `projects.inquiry_id` 연결을 재사용한다.
5. 그래도 없을 때만 고객과 프로젝트를 생성한다.
6. 문의의 `converted_*_id`와 `status='converted'`를 저장하고 고객·프로젝트를 반환한다.
7. 모든 단계가 성공해야 commit하며 실패 시 전체 rollback한다.

RPC는 관리자 사용자 client가 인증된 세션으로 호출할 수 있도록 migration에 정의한다. 기존 데이터는 `inquiry_id` 연결을 기준으로 `converted_*_id`를 보정하는 별도 SQL을 적용할 수 있도록 절차만 기록하고, 이번 PR에서는 원격 DB에 실행하지 않는다.

## 목록 API 계약

`GET /api/admin/customers`와 `GET /api/admin/projects`는 관리자 인증 후 다음 query를 받는다.

- `q`: 이름·회사명·이메일·전화·웹사이트(프로젝트는 이름·설명 포함) 부분 검색
- `status`: 프로젝트 상태 필터
- `sort`: 허용된 필드와 `asc|desc` 방향
- `page`: 1부터 시작, 기본 1
- `pageSize`: 1~100, 기본 20

응답은 `{ items, page, pageSize, total, totalPages }`로 통일한다. 허용되지 않은 sort/status와 잘못된 숫자는 400으로 반환한다.

## 오류 및 보안

- 모든 관리자 route는 기존 `getVerifiedAdminSupabase`를 사용한다.
- payload/query는 Zod로 검증한다.
- DB 오류 원문은 응답에 노출하지 않고 도메인 코드로 매핑한다.
- 이미 전환된 문의는 새 row를 만들지 않고 기존 연결을 반환한다.

## 테스트 및 검증

- 전환 API: 성공, 재호출 idempotency, 기존 연결 재사용, 인증/검증 실패
- 목록 API: 검색, 상태 필터, 정렬, 페이지네이션, 인증/검증 실패
- RPC SQL: 함수·제약·인덱스·보정 절차 정적 검증
- `npm run lint`, `npm run type-check`, `npm test`, production build
