import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  amountErrorMessage,
  getPaymentDisplayStatus,
  paymentKindLabels,
  paymentDisplayStatusLabels,
  paymentStatusLabels,
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
    const payment = { status: "expected" as const, amount: 1000, receivedAmount: 400, outstandingAmount: 600 };
    assert.equal(getPaymentDisplayStatus(payment), "partial");
    assert.equal(getPaymentDisplayStatus({ ...payment, receivedAmount: 1000, outstandingAmount: 0 }), "paid");
    assert.equal(getPaymentDisplayStatus({ ...payment, status: "overdue", receivedAmount: 0, outstandingAmount: 1000 }), "overdue");
    assert.equal(getPaymentDisplayStatus({ ...payment, status: "cancelled" }), "cancelled");
  });
});
