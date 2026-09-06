import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  amountErrorMessage,
  formatSeoulDate,
  getPaymentDisplayStatus,
  paymentKindLabels,
  paymentDisplayStatusLabels,
  paymentStatusLabels,
  receiptPayloadFingerprint,
  resolveReceiptIdempotencyKey,
  parsePositiveInteger,
  toCreatePaymentInput,
} from "../src/widgets/admin-customer-projects/model/admin-project-payment-state";

describe("admin project payment form state", () => {
  test("exposes customer-facing payment labels", () => {
    assert.equal(paymentKindLabels.deposit, "계약금");
    assert.equal(paymentKindLabels.balance, "잔금");
    assert.equal(paymentKindLabels.extra, "추가 비용");
    assert.equal(paymentStatusLabels.overdue, "미수");
    assert.equal(paymentDisplayStatusLabels.partial, "부분 입금");
  });

  test("accepts only positive safe integer amounts", () => {
    assert.equal(parsePositiveInteger("500000"), 500000);
    assert.equal(parsePositiveInteger("0"), undefined);
    assert.equal(parsePositiveInteger("12.5"), undefined);
    assert.equal(amountErrorMessage(""), "금액을 입력해 주세요.");
    assert.equal(amountErrorMessage("0"), "금액은 1원 이상의 정수로 입력해 주세요.");
    assert.equal(amountErrorMessage("100"), undefined);
  });

  test("builds backend input without empty optional values", () => {
    assert.deepEqual(
      toCreatePaymentInput({ kind: "balance", amount: "1000", dueDate: "", memo: "  " }),
      { kind: "balance", amount: 1000 },
    );
    assert.equal(toCreatePaymentInput({ kind: "deposit", amount: "abc", dueDate: "", memo: "" }), undefined);
  });

  test("derives partial and paid status from receipt balances", () => {
    const payment = { status: "expected" as const, amount: 1000, due_date: "2026-09-05", receivedAmount: 400, outstandingAmount: 600 };
    assert.equal(getPaymentDisplayStatus(payment), "partial");
    assert.equal(getPaymentDisplayStatus({ ...payment, receivedAmount: 1000, outstandingAmount: 0 }), "paid");
    assert.equal(getPaymentDisplayStatus({ ...payment, status: "overdue", receivedAmount: 0, outstandingAmount: 1000 }), "overdue");
    assert.equal(getPaymentDisplayStatus({ ...payment, status: "cancelled" }), "cancelled");
    assert.equal(getPaymentDisplayStatus({ ...payment, receivedAmount: 0, outstandingAmount: 1000 }, new Date("2026-09-06T00:00:00+09:00")), "overdue");
    assert.equal(getPaymentDisplayStatus({ ...payment, due_date: "2026-09-06", receivedAmount: 0, outstandingAmount: 1000 }, new Date("2026-09-06T12:00:00+09:00")), "expected");
  });

  test("keeps the key for identical retries and rotates it after payload changes", () => {
    const first = receiptPayloadFingerprint({ amount: "100", receivedAt: "2026-09-06", memo: "a" });
    const same = receiptPayloadFingerprint({ amount: "100", receivedAt: "2026-09-06", memo: "a" });
    const changed = receiptPayloadFingerprint({ amount: "200", receivedAt: "2026-09-06", memo: "a" });
    assert.equal(resolveReceiptIdempotencyKey("key-1", undefined, first), "key-1");
    assert.equal(resolveReceiptIdempotencyKey("key-1", first, same), "key-1");
    assert.notEqual(resolveReceiptIdempotencyKey("key-1", first, changed), "key-1");
  });

  test("formats UTC instants using the Seoul calendar date", () => {
    assert.equal(formatSeoulDate("2026-09-05T23:30:00.000Z"), "2026-09-06");
    assert.equal(formatSeoulDate("2026-09-06T00:30:00.000Z"), "2026-09-06");
  });
});
