import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getInquiryQuoteApprovalLabel,
  getInquiryQuoteStatusLabel,
  getInquiryQuotesQueryKey,
  sortInquiryQuotes,
  formatApprovalDate,
} from "../src/widgets/admin-inquiry-quotes/model/admin-inquiry-quotes-state";
import { fetchInquiryQuotes } from "../src/widgets/admin-inquiry-quotes/model/admin-inquiry-quotes-queries";

describe("admin inquiry quote summary", () => {
  test("keeps inquiry query keys isolated", () => {
    assert.notDeepEqual(getInquiryQuotesQueryKey("inquiry-a"), getInquiryQuotesQueryKey("inquiry-b"));
  });

  test("sorts linked quotes newest first without inventing fields", () => {
    const quotes = [
      { id: "old", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
      { id: "new", createdAt: "2026-09-03T00:00:00Z", updatedAt: "2026-09-04T00:00:00Z" },
    ];
    assert.deepEqual(sortInquiryQuotes(quotes).map((quote) => quote.id), ["new", "old"]);
  });

  test("distinguishes approval states and formats nullable approval details", () => {
    assert.equal(getInquiryQuoteStatusLabel("draft"), "작성 중");
    assert.equal(getInquiryQuoteStatusLabel("approved"), "승인됨");
    assert.equal(getInquiryQuoteApprovalLabel(null), "승인 전");
    assert.equal(getInquiryQuoteApprovalLabel({ quoteVersionId: "version-1", approverName: "홍길동", consentVersion: "2026-09-14", approvedAt: "2026-09-07T01:00:00Z" }), "승인 완료");
    assert.equal(formatApprovalDate(null), "승인 전");
    assert.match(formatApprovalDate("2026-09-07T01:00:00Z"), /2026/);
  });

  test("fetches only the selected inquiry quote endpoint and returns sorted summaries", async () => {
    const originalFetch = globalThis.fetch;
    let requested = "";
    globalThis.fetch = async (input) => {
      requested = String(input);
      return Response.json({ data: { quotes: [{ id: "q", inquiryId: "inquiry/1", status: "approved", approvedVersionId: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", approval: null }] } });
    };
    try {
      const result = await fetchInquiryQuotes("inquiry/1");
      assert.equal(requested, "/api/admin/inquiries/inquiry%2F1/quotes");
      assert.equal(result.quotes[0]?.id, "q");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
