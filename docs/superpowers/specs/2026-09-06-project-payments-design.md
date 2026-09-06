# 프로젝트 결제·입금·미수금 설계

## 목표

관리자가 프로젝트별 결제 예정 항목과 실제 입금을 분리해 기록하고, 부분 입금과 추가 비용을 포함한 매출·미수금 요약을 일관되게 조회한다.

## 데이터 모델

- 기존 `payments`는 계약금·잔금·추가 비용의 예정 항목으로 사용한다.
- 새 `payment_receipts`는 실제 입금을 저장한다. `payment_id`, 양의 정수 `amount`, `received_at`, 선택 메모, UUID `idempotency_key`, 생성·수정 시각을 가진다.
- `(payment_id, idempotency_key)` 고유 인덱스로 동일 입금 요청의 중복 저장을 방지한다.
- `payment_receipts.payment_id`는 `payments.id`를 참조하며 예정 항목 삭제 시 함께 삭제된다.
- 관리자 전용 RLS를 적용하고 anon/public에는 접근 권한을 부여하지 않는다. 서버 API도 service-role이 아닌 검증된 관리자 사용자 client를 사용한다.

## 계산 규칙

- 예상 매출: `project.contract_amount + 취소되지 않은 extra 예정 항목 합계`
- 확정 매출: 취소되지 않은 모든 예정 항목 합계
- 입금 합계: 실제 입금 내역 합계
- 미수금: `max(확정 매출 - 입금 합계, 0)`
- 예정 항목별 입금액과 잔액도 같은 규칙으로 계산한다. 부분 입금은 예정 금액보다 작은 receipt 합계로 표현한다.

## API

- `GET /api/admin/projects/:id/payments`: 예정 항목, 실제 입금, 프로젝트 요약 조회
- `POST /api/admin/projects/:id/payments`: 예정 항목 생성
- `PATCH /api/admin/payments/:id`: 예정 항목 수정
- `DELETE /api/admin/payments/:id`: 예정 항목과 연결 입금 삭제
- `POST /api/admin/payments/:id/receipts`: idempotency key를 포함한 실제 입금 등록
- `DELETE /api/admin/payment-receipts/:id`: 실제 입금 삭제

모든 API는 관리자 인증, UUID·금액·날짜·enum 검증, 404와 DB 오류 매핑을 제공한다. 중복 idempotency key는 기존 receipt를 반환해 재시도를 성공으로 처리한다.

## 테스트

- 순수 계산 테스트: 계약금·잔금·추가 비용, 부분 입금, 초과 입금, 취소 항목
- API 테스트: 인증, 입력 검증, CRUD, 404, 중복 입금 멱등성, DB 오류
- migration 테스트: 테이블·고유 인덱스·RLS·권한
- 로컬 PostgreSQL 통합 테스트: RLS와 중복 idempotency key 검증

원격 Supabase migration은 이 PR에서 적용하지 않는다.
