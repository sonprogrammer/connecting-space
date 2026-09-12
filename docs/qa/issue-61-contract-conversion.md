# 이슈 #61 서명 확인·프로젝트 전환 QA

## 범위

- 관리자 `POST /api/admin/quote-versions/:id/confirm-contract`
- 승인된 최신 견적과 발송 이력 확인
- 고객·프로젝트·계약금·잔금의 단일 DB 전환
- 멱등 재시도, 금액 override, RLS·rollback·동시성

## 로컬 검증

원격 Supabase에 연결하지 말고 격리 로컬에서만 실행한다. URL host가 `localhost` 또는 `127.0.0.1`인지 확인한다.

```bash
supabase start
supabase db reset
supabase status -o env
npm test
npm run lint
npm run type-check
npm run build -- --webpack
```

통합 테스트가 `supabase status -o env`에서 로컬 키를 읽고 테스트용 관리자·문의·견적 fixture를 생성·정리하므로 별도 ID나 access token 설정이 필요 없다:

```bash
RUN_QUOTE_CONTRACT_INTEGRATION_TESTS=1 \
npm test
```

위 명령은 `supabase db reset` 직후 실행하며, fixture와 인증 사용자는 테스트 종료 시 정리한다.

확인할 항목:

1. 미승인·만료·계약서 미확인 버전은 409이며 row가 생성되지 않는다.
2. 승인된 최신 버전은 201로 고객·프로젝트·계약금·잔금을 생성한다.
3. 동일 멱등 키 재시도는 200과 기존 confirmation ID를 반환하고 추가 row가 없다.
4. 1원 홀수 총액은 두 payment 합계가 총액과 정확히 일치한다.
5. 비율은 합계 100%, 금액 override는 총액 일치·비율 일치를 검증한다.
6. deposit 기본 예정일은 확인일, balance 기본 예정일은 견적 예상 출시일이다.
7. 익명·비관리자 RLS 접근은 차단되고 DB 오류 시 transaction 전체가 rollback된다.

실제 고객 데이터·토큰·access token은 로그·이슈·PR에 기록하지 않는다. 원격 DB migration과 배포·머지는 이 작업에서 수행하지 않는다.
