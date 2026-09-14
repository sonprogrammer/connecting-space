# 이슈 #70 공개 견적 조회·승인 QA

## 담당 역할

백엔드 에이전트

## 로컬 검증

원격 DB에 연결하지 않고 로컬 Supabase에서 migration-from-zero를 실행한다.

```bash
supabase start
supabase db reset --local --yes
npm test
RUN_QUOTE_INTEGRATION_TESTS=1 npm test
npm run lint
npm run type-check
npm run build -- --webpack
```

검증 범위:

- 공개 GET의 available/approved/expired/cancelled/unavailable 구분과 민감정보 비노출
- 승인자 이름 trim·길이·제어문자 및 `consentAccepted: true` 검증
- 승인 감사 이력의 `approver_name`·`consent_version` 저장
- 동일 토큰 재제출·동시 요청에서 승인 row 1건과 일관된 결과
- 토큰 교체·폐기·만료, RLS, row lock, rollback

실제 토큰 원문·해시·고객 연락처는 로그나 응답에 기록하지 않는다. 원격 migration·배포·머지는 수행하지 않는다.
