import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";

import {
  createManualQuotePdfPayload,
  renderManualQuotePdf,
} from "../src/entities/quote/server/manual-pdf";

const token = "wAAodXM0W5e9rh0D65xQ2HncrB20n5o9LrG-KpOvR3c";

describe("수동 발송 견적 PDF", () => {
  test("불변 견적 스냅샷을 PDF 표시 계약으로 정확히 옮긴다", () => {
    const payload = createManualQuotePdfPayload({
      customerName: "홍길동 고객",
      token,
      publicBaseUrl: "https://quotes.example.test",
      issuedAt: "2026-09-08T01:00:00.000Z",
      expiresAt: "2026-09-15T01:00:00.000Z",
      version: quoteVersion(),
    });

    assert.deepEqual(payload, {
      customerName: "홍길동 고객",
      title: "브랜드 사이트 구축 견적",
      body: "반응형 사이트 제작과 운영 인계를 포함합니다.",
      scopeItems: ["기획", "디자인", "개발"],
      totalAmount: 1_100_000,
      estimatedStartDate: "2026-09-10",
      estimatedEndDate: "2026-10-10",
      depositAmount: 400_000,
      balanceAmount: 700_000,
      depositTerms: "착수 전 입금",
      balanceTerms: "검수 완료 후 입금",
      issuedAt: "2026-09-08T01:00:00.000Z",
      expiresAt: "2026-09-15T01:00:00.000Z",
      approvalUrl: `https://quotes.example.test/quotes/${token}`,
    });
  });

  test("한글 견적과 클릭 가능한 승인 URL이 든 유효한 PDF를 만든다", async () => {
    const payload = createManualQuotePdfPayload({
      customerName: "홍길동 고객",
      token,
      publicBaseUrl: "https://quotes.example.test",
      issuedAt: "2026-09-08T01:00:00.000Z",
      expiresAt: "2026-09-15T01:00:00.000Z",
      version: quoteVersion(),
    });
    const bytes = await renderManualQuotePdf(payload);

    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString("ascii"), "%PDF-");
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getTitle(), "브랜드 사이트 구축 견적");
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(findLink(pdf), payload.approvalUrl);
  });

  test("긴 본문과 작업 항목은 잘리지 않고 여러 페이지로 나눈다", async () => {
    const version = quoteVersion();
    version.body = "긴 견적 설명입니다. ".repeat(800);
    version.scope_items = Array.from(
      { length: 100 },
      (_, index) => `${index + 1}번째 작업 범위와 상세 설명`,
    );
    const bytes = await renderManualQuotePdf(
      createManualQuotePdfPayload({
        customerName: "홍길동 고객",
        token,
        publicBaseUrl: "https://quotes.example.test",
        issuedAt: "2026-09-08T01:00:00.000Z",
        expiresAt: "2026-09-15T01:00:00.000Z",
        version,
      }),
    );

    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 1);
    assert.equal(findLink(pdf), `https://quotes.example.test/quotes/${token}`);
  });
});

function findLink(pdf: PDFDocument) {
  for (const page of pdf.getPages()) {
    const annotations = page.node.Annots()?.asArray() ?? [];
    for (const annotation of annotations) {
      const dictionary = pdf.context.lookup(annotation);
      if (!(dictionary instanceof PDFDict)) continue;
      const actionRef = dictionary.get(PDFName.of("A"));
      const action = actionRef ? pdf.context.lookup(actionRef) : undefined;
      if (!(action instanceof PDFDict)) continue;
      const uri = action.get(PDFName.of("URI"));
      if (uri instanceof PDFString) return uri.decodeText();
    }
  }
  return null;
}

function quoteVersion() {
  return {
    title: "브랜드 사이트 구축 견적",
    body: "반응형 사이트 제작과 운영 인계를 포함합니다.",
    scope_items: ["기획", "디자인", "개발"] as unknown,
    total_amount: 1_100_000,
    estimated_start_date: "2026-09-10",
    estimated_end_date: "2026-10-10",
    deposit_amount: 400_000,
    balance_amount: 700_000,
    deposit_terms: "착수 전 입금",
    balance_terms: "검수 완료 후 입금",
  };
}
