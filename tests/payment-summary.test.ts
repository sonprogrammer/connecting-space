import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { calculateProjectPaymentSummary } from "../src/entities/payment/model/summary";

const payments = [
  { id: "deposit", kind: "deposit" as const, status: "paid" as const, amount: 300 },
  { id: "balance", kind: "balance" as const, status: "expected" as const, amount: 700 },
  { id: "extra", kind: "extra" as const, status: "expected" as const, amount: 200 },
  { id: "cancelled", kind: "extra" as const, status: "cancelled" as const, amount: 100 },
];

describe("project payment summary", () => {
  test("includes partial receipts and non-cancelled extras", () => {
    const result = calculateProjectPaymentSummary(1_000, payments, [
      { payment_id: "deposit", amount: 300 },
      { payment_id: "balance", amount: 200 },
    ]);

    assert.deepEqual(result, {
      expectedRevenue: 1_200,
      confirmedRevenue: 1_200,
      receivedTotal: 500,
      outstanding: 700,
      payments: [
        { paymentId: "deposit", receivedAmount: 300, outstandingAmount: 0 },
        { paymentId: "balance", receivedAmount: 200, outstandingAmount: 500 },
        { paymentId: "extra", receivedAmount: 0, outstandingAmount: 200 },
        { paymentId: "cancelled", receivedAmount: 0, outstandingAmount: 0 },
      ],
    });
  });

  test("never reports a negative outstanding amount after overpayment", () => {
    const result = calculateProjectPaymentSummary(100, [payments[0]], [
      { payment_id: "deposit", amount: 500 },
    ]);
    assert.equal(result.receivedTotal, 500);
    assert.equal(result.outstanding, 0);
  });
});
