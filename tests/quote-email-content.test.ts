import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuoteApprovalEmail } from "../src/entities/quote/server/email-content";

describe("견적 승인 이메일", () => {
  it("HTML과 text에 견적 요약·만료일·승인 링크를 넣고 HTML을 escape한다", () => {
    const result = buildQuoteApprovalEmail({
      recipient: "qa@example.invalid", customerName: "<김고객>", title: "랜딩 <구축>",
      body: "요청 내용", scopeItems: ["디자인", "개발"], totalAmount: 1000000,
      estimatedStartDate: null, estimatedEndDate: null, depositAmount: 300000,
      balanceAmount: 700000, depositTerms: "계약 시", balanceTerms: "완료 시",
      token: "token-value", expiresAt: "2026-09-14T00:00:00.000Z",
    }, "https://example.test");
    assert.match(result.html, /&lt;김고객&gt;/);
    assert.doesNotMatch(result.html, /<김고객>/);
    assert.match(result.html, /견적 확인 및 승인/);
    assert.match(result.text, /1,000,000원/);
    assert.match(result.text, /2026년 9월 14일/);
    assert.match(result.text, /https:\/\/example\.test\/quotes\/token-value/);
    assert.equal(result.to, "qa@example.invalid");
  });
});
