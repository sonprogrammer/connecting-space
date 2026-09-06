# 프로젝트 결제·입금·미수금 관리 UI 설계

## 목표

관리자가 프로젝트 상세에서 결제 예정 항목과 실제 입금을 생성·수정·삭제하고, 예상 매출·확정 매출·입금 합계·미수금을 즉시 확인할 수 있게 한다.

## 범위와 제약

- 기존 결제 API만 사용한다. API route, 원격 DB, migration은 변경하지 않는다.
- 기존 프로젝트 관리 화면의 프로젝트 상세 영역에 결제 관리 섹션을 추가한다.
- 금액은 양의 정수만 전송하며, 빈 값·소수·음수·숫자가 아닌 값은 저장 전에 차단한다.
- 401/403, validation, 404, 네트워크 오류를 사용자에게 안전한 한국어 메시지로 표시한다.
- 저장 중 컨트롤을 비활성화하고 성공 notice와 오류 재시도를 제공한다.
- 결제 query는 프로젝트별 TanStack Query key로 캐시하고, 모든 mutation 성공 후 해당 프로젝트 query를 invalidate한다.

## UI 구조

- `ProjectPaymentManager`: 프로젝트 결제 query, 요약 카드, 예정 항목 목록, 입금 내역, mutation 상태를 조합한다.
- 요약 카드: 예상 매출, 확정 매출, 입금 합계, 미수금.
- 예정 항목 행: 종류, 상태, 예정 금액, 입금액, 잔액, 예정일, 수정·삭제 actions.
- 입금 내역: 항목별 실제 입금 amount/received_at/memo, 삭제 action.
- 결제/입금 폼: accessible label, `aria-invalid`, `role=alert`, 저장 중 `aria-busy`.
- 반응형: 작은 화면은 카드와 세로 스택, 넓은 화면은 표 형태를 사용한다.

## 데이터 흐름

`GET /api/admin/projects/:id/payments`로 `AdminProjectPaymentsResponse`를 조회한다. 예정 항목 생성·수정·삭제와 입금 생성·삭제는 해당 API를 호출하고, 성공 시 query를 invalidate/refetch해 요약·잔액·목록을 서버 계산 결과와 일치시킨다. 입금 생성에는 매 시도마다 새 UUID `idempotencyKey`를 사용한다.

## 테스트와 검증

- query key와 API response parser 테스트
- 금액/날짜 폼 변환 및 validation 테스트
- 결제·입금 mutation 성공/실패/인증 만료 상태 테스트
- 캐시 invalidate 후 요약·잔액 갱신 테스트
- `npm run lint`, `npm run type-check`, `npm test`, `npm run build -- --webpack`, `git diff --check`
