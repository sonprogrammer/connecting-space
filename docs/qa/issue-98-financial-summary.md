# #98 관리자 재무 합계 API

## 요청과 응답

`GET /api/admin/financial-summary?status=active` — 관리자 쿠키 인증 필요. query는 `status` 하나만 허용하고 중복/알 수 없는 query는 400으로 거부한다.

- `active`(기본): planning, in_progress, review, paused. 보류 중인 계약도 남아 있으므로 paused를 포함한다.
- 개별 상태: planning, in_progress, review, completed, paused, cancelled.
- `all`: 여섯 상태 모두. cancelled 프로젝트도 명시적으로 포함한 전체이며 payment의 cancelled 제외 규칙과 구분한다.

상태 범위는 이 API의 명시적 조회 계약이다. #37 프론트는 기본 진행 범위를 쓰거나 상태별 필터를 전달할 수 있다.

```json
{"data":{"asOf":"2026-10-25T00:00:00.000Z","status":"active","includedStatuses":["planning","in_progress","review","paused"],"projectCount":0,"expectedRevenue":0,"confirmedRevenue":0,"receivedTotal":0,"outstanding":0}}
```

금액은 기존 프로젝트별 summary와 같은 정수 단위다. 빈 결과는 projectCount=0, 네 금액 모두 0. 고객/프로젝트 상세·결제 행은 반환하지 않는다. 성공 헤더는 `Cache-Control: private, no-store`.

## 프로젝트별 계산 후 합산

기존 `calculateProjectPaymentSummary` 및 프로젝트 결제 GET의 summary와 동일하다.

| 필드 | 프로젝트별 계산식 |
| --- | --- |
| expectedRevenue | contract_amount + 취소되지 않은 extra payment 금액 합 |
| confirmedRevenue | 취소되지 않은 모든 payment 금액 합 |
| receivedTotal | 해당 프로젝트 payment에 연결된 모든 receipt 금액 합 |
| outstanding | max(confirmedRevenue - receivedTotal, 0) |

- cancelled payment는 예정 추가금·확정금에서 제외하지만 기존 summary처럼 그 payment의 receipt는 receivedTotal에 포함한다.
- payment가 없으면 expectedRevenue=계약금액, 나머지는 0이다.
- 부분 입금은 실제 receipt만 합산한다. paid 상태만으로 입금을 추정하지 않는다.
- 초과입금은 receivedTotal에 그대로 포함하며 해당 프로젝트 outstanding만 0으로 제한한다. 한 프로젝트의 초과입금으로 다른 프로젝트의 미수금을 상계하지 않는다.
- payment와 receipt를 각각 먼저 집계해 join 중복 합산을 방지한다. DB bigint/numeric으로 합산하며 JS 안전 정수 범위를 넘는 응답은 잘못된 반올림 대신 안전한 500 오류로 처리한다.

## 시점·권한·오류

`get_admin_financial_summary`는 STABLE, SECURITY INVOKER, 고정 search_path와 관리자 검사, authenticated execute 권한을 사용한다. 기존 projects/payments/payment_receipts RLS를 유지한다. 관리자 인증 후 집계 데이터 RPC 한 번으로 전 범위를 읽으며 행 수 제한/페이지별 N+1 합산은 하지 않는다(인증용 조회는 별도).

한 RPC의 동일 DB statement snapshot에서 세 테이블을 집계한다. `asOf`는 DB statement_timestamp 표시이며 과거 상태를 재생하는 cutoff나 여러 요청 사이에 고정되는 snapshot 토큰이 아니다. 요청이 달라지면 중간 입금/상태 변경이 반영될 수 있다. GET은 데이터를 변경하지 않는다.

- 401/403: 기존 ADMIN_AUTH_REQUIRED, 오류 no-store
- 400: VALIDATION_ERROR
- 500: ADMIN_FINANCIAL_SUMMARY_READ_FAILED (DB 원문·상세 데이터 미노출)

새 migration: `202610250001_admin_financial_summary.sql`. 원격 미적용. 운영 적용·배포는 머지 이후 별도 승인 대상이다. 새 환경변수 없음.

## 로컬 재현

Node `.nvmrc` 버전, Docker, Supabase CLI가 필요하다. Docker가 PATH에 없다면 Docker Desktop의 CLI 경로를 PATH에 추가한다.

```bash
nvm use
bash scripts/test-financial-summary-local.sh
```

스크립트는 임시 디렉터리·새 project ID와 localhost 56541/56542 포트를 사용한다. 포트가 사용 중이면 다른 작업을 정지시키지 말고 빈 포트로 스크립트 설정을 조정한다. 기존 프로젝트 config나 linked DB를 사용하지 않는다. migration-from-zero 후 테스트 관리자/일반 사용자·프로젝트·결제·입금을 직접 생성하며 finally에서 정리하고 스크립트 종료 시 전용 컨테이너·볼륨도 정리한다. 실제 AI/Slack/이메일 전송 없음.

DB 검증: 빈 결과, 여섯 개별 상태/active/all, 기존 JS summary와 parity, 취소 추가금과 취소 payment 입금, 부분·초과입금, payment 없는 프로젝트, anon/일반 사용자 RPC 차단·RLS, 1001개 추가 프로젝트의 전 범위 집계, 병렬 읽기. API 검증: 401/403 auth-first, query 오류, RPC 1회, private/no-store, DB 실패/안전 정수 오류.

```bash
npm test
npm run lint
npm run type-check
npm run build -- --webpack
```

일반 npm test에서 통합 환경 미설정 시 DB suite는 skip된다. DB 검증은 위 전용 명령으로 별도 실행해야 한다.
