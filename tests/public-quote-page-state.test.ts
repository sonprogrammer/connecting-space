import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  formatQuoteAmount,
  formatQuoteDate,
  getPublicQuoteErrorState,
  normalizeScopeItems,
  validateApprovalForm,
} from "../src/widgets/public-quote/model/public-quote-state";
import { approvePublicQuote } from "../src/widgets/public-quote/model/public-quote-queries";

describe("public quote approval state", () => {
  test("normalizes only customer-visible scope strings", () => {
    assert.deepEqual(normalizeScopeItems(["상품 화면", 123, null, "주문 화면"]), ["상품 화면", "주문 화면"]);
    assert.deepEqual(normalizeScopeItems({ internal: "note" }), []);
  });

  test("formats quote amounts and dates for Korean customers", () => {
    assert.equal(formatQuoteAmount(1200000), "1,200,000원");
    assert.equal(formatQuoteDate("2026-09-10"), "2026년 9월 10일");
    assert.equal(formatQuoteDate(null), "일정 협의");
  });

  test("maps API failures to safe customer-facing states", () => {
    assert.equal(getPublicQuoteErrorState(410), "expired");
    assert.equal(getPublicQuoteErrorState(404), "unavailable");
    assert.equal(getPublicQuoteErrorState(409), "unavailable");
    assert.equal(getPublicQuoteErrorState(500), "error");
  });

  test("requires customer name and explicit consent before approval", () => {
    assert.deepEqual(validateApprovalForm({ customerName: "", consent: false }), {
      customerName: "고객명을 입력해 주세요.",
      consent: "견적 내용 확인 및 승인에 동의해 주세요.",
    });
    assert.deepEqual(validateApprovalForm({ customerName: "홍길동", consent: false }), {
      consent: "견적 내용 확인 및 승인에 동의해 주세요.",
    });
    assert.deepEqual(validateApprovalForm({ customerName: "홍길동", consent: true }), {});
  });

  test("sends the trimmed approver name and explicit consent once", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      calls += 1;
      request = { input, init };
      return new Response(JSON.stringify({ data: { quoteId: "q", quoteVersionId: "v", approvedAt: "2026-09-27T00:00:00Z" } }), { status: 200 });
    };
    try {
      await approvePublicQuote("token", { approverName: " 홍길동 ", consentAccepted: true });
      assert.equal(calls, 1);
      assert.equal(request?.input, "/api/quotes/token/approve");
      assert.equal(request?.init?.method, "POST");
      assert.deepEqual(JSON.parse(String(request?.init?.body)), { approverName: "홍길동", consentAccepted: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
