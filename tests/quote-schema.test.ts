import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { adminCreateInquirySchema } from "../src/entities/inquiry/schemas/admin-inquiry.schema";
import {
  createQuoteSchema,
  manualQuoteDeliverySchema,
  quoteSnapshotSchema,
} from "../src/entities/quote/schemas/quote.schema";

const validSnapshot = {
  title: "쇼핑몰 구축 견적",
  body: "반응형 쇼핑몰 구축과 운영 인계를 포함합니다.",
  scopeItems: ["상품·주문 화면", "관리자 운영 인계"],
  totalAmount: 1_000_000,
  estimatedStartDate: "2026-09-10",
  estimatedEndDate: "2026-10-10",
  depositAmount: 300_000,
  balanceAmount: 700_000,
  depositTerms: "계약 진행 전 입금",
  balanceTerms: "최종 검수 후 입금",
};

describe("견적 입력 스키마", () => {
  test("완전한 견적 스냅샷을 trim하고 금액·날짜를 유지한다", () => {
    const parsed = quoteSnapshotSchema.parse({
      ...validSnapshot,
      title: `  ${validSnapshot.title}  `,
      scopeItems: ["  상품·주문 화면  ", "관리자 운영 인계"],
    });

    assert.equal(parsed.title, validSnapshot.title);
    assert.deepEqual(parsed.scopeItems, validSnapshot.scopeItems);
    assert.equal(parsed.depositAmount + parsed.balanceAmount, parsed.totalAmount);
  });

  test("금액 불일치·역전 날짜·빈 작업 범위·안전하지 않은 정수를 거부한다", () => {
    assert.equal(
      quoteSnapshotSchema.safeParse({ ...validSnapshot, balanceAmount: 699_999 })
        .success,
      false,
    );
    assert.equal(
      quoteSnapshotSchema.safeParse({
        ...validSnapshot,
        estimatedEndDate: "2026-09-01",
      }).success,
      false,
    );
    assert.equal(
      quoteSnapshotSchema.safeParse({ ...validSnapshot, scopeItems: [] }).success,
      false,
    );
    assert.equal(
      quoteSnapshotSchema.safeParse({
        ...validSnapshot,
        totalAmount: Number.MAX_SAFE_INTEGER + 1,
      }).success,
      false,
    );
  });

  test("견적 생성에는 유효한 문의 UUID가 필요하다", () => {
    assert.equal(
      createQuoteSchema.safeParse({
        inquiryId: "11111111-1111-4111-8111-111111111111",
        ...validSnapshot,
      }).success,
      true,
    );
    assert.equal(
      createQuoteSchema.safeParse({ inquiryId: "invalid", ...validSnapshot })
        .success,
      false,
    );
  });
});

describe("관리자 직접 문의 스키마", () => {
  test("관리자 메모를 받고 누락된 source를 admin_manual로 지정한다", () => {
    const parsed = adminCreateInquirySchema.parse({
      customerName: "손영진",
      serviceType: "아임웹 제작",
      message: "전화로 접수한 신규 사이트 제작 문의입니다.",
      adminNotes: "오후에 다시 연락",
    });

    assert.equal(parsed.source, "admin_manual");
    assert.equal(parsed.adminNotes, "오후에 다시 연락");
  });
});

describe("수동 견적 발급 요청 스키마", () => {
  test("UUID 멱등 키와 명시적 재발급 여부만 허용한다", () => {
    assert.deepEqual(
      manualQuoteDeliverySchema.parse({
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      }),
      {
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
        reissue: false,
      },
    );
    assert.equal(
      manualQuoteDeliverySchema.safeParse({
        idempotencyKey: "invalid",
        reissue: true,
      }).success,
      false,
    );
    assert.equal(
      manualQuoteDeliverySchema.safeParse({
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
        token: "must-not-be-accepted",
      }).success,
      false,
    );
  });
});
