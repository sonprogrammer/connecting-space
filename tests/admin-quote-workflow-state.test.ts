import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateQuoteSplit,
  getQuoteDeliveryLabel,
  getQuoteStatusLabel,
  toQuoteSnapshotPayload,
  validateQuoteDraft,
} from "../src/widgets/admin-quote-workflow/model/admin-quote-workflow-state";

describe("admin quote workflow state", () => {
  test("calculates exact integer deposit and balance defaults", () => {
    assert.deepEqual(calculateQuoteSplit(101, 30), { depositAmount: 30, balanceAmount: 71 });
    assert.deepEqual(calculateQuoteSplit(0, 30), { depositAmount: 0, balanceAmount: 0 });
  });

  test("rejects missing fields, inverted dates, and mismatched totals", () => {
    const errors = validateQuoteDraft({
      title: "",
      body: "",
      scopeItems: [""],
      totalAmount: "1000",
      estimatedStartDate: "2026-10-10",
      estimatedEndDate: "2026-10-01",
      depositAmount: "300",
      balanceAmount: "600",
      depositTerms: "",
      balanceTerms: "",
    });
    assert.equal(errors.title, "견적 제목을 입력해 주세요.");
    assert.equal(errors.totalAmount, undefined);
    assert.equal(errors.balanceAmount, "계약금과 잔금의 합계가 총액과 같아야 합니다.");
    assert.equal(errors.estimatedEndDate, "종료일은 시작일보다 빠를 수 없습니다.");
  });

  test("builds the backend snapshot contract without UI-only values", () => {
    assert.deepEqual(
      toQuoteSnapshotPayload({
        title: "  쇼핑몰  ",
        body: "  본문  ",
        scopeItems: [" 화면 ", "", "개발"],
        totalAmount: "1000",
        estimatedStartDate: "",
        estimatedEndDate: "2026-10-01",
        depositAmount: "300",
        balanceAmount: "700",
        depositTerms: " 선금 ",
        balanceTerms: " 잔금 ",
      }),
      {
        title: "쇼핑몰",
        body: "본문",
        scopeItems: ["화면", "개발"],
        totalAmount: 1000,
        estimatedStartDate: null,
        estimatedEndDate: "2026-10-01",
        depositAmount: 300,
        balanceAmount: 700,
        depositTerms: "선금",
        balanceTerms: "잔금",
      },
    );
  });

  test("maps server statuses to clear admin labels", () => {
    assert.equal(getQuoteStatusLabel("draft"), "작성 중");
    assert.equal(getQuoteStatusLabel("sent"), "발송됨");
    assert.equal(getQuoteStatusLabel("approved"), "승인됨");
    assert.equal(getQuoteStatusLabel("expired"), "만료됨");
    assert.equal(getQuoteDeliveryLabel("failed"), "발송 실패");
    assert.equal(getQuoteDeliveryLabel("retry"), "재시도 대기");
  });
});
