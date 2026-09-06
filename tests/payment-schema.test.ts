import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createPaymentReceiptSchema,
  createPaymentSchema,
  updatePaymentReceiptSchema,
  updatePaymentSchema,
} from "../src/entities/payment/schemas/payment.schema";

describe("payment schemas", () => {
  test("accepts valid payment schedules and receipts", () => {
    assert.equal(createPaymentSchema.safeParse({ kind: "deposit", amount: 100, dueDate: "2026-09-30", memo: "" }).success, true);
    assert.equal(createPaymentReceiptSchema.safeParse({ amount: 50, receivedAt: "2026-09-06T10:00:00.000Z", idempotencyKey: "11111111-1111-4111-8111-111111111111", memo: "부분 입금" }).success, true);
  });

  test("rejects non-integer or non-positive amounts and invalid enums", () => {
    for (const amount of [0, -1, 1.5]) {
      assert.equal(createPaymentSchema.safeParse({ kind: "deposit", amount }).success, false);
      assert.equal(createPaymentReceiptSchema.safeParse({ amount, idempotencyKey: "11111111-1111-4111-8111-111111111111" }).success, false);
    }
    assert.equal(createPaymentSchema.safeParse({ kind: "unknown", amount: 1 }).success, false);
  });

  test("requires at least one valid payment update field", () => {
    assert.equal(updatePaymentSchema.safeParse({}).success, false);
    assert.equal(updatePaymentSchema.safeParse({ status: "cancelled" }).success, true);
    assert.equal(updatePaymentReceiptSchema.safeParse({}).success, false);
    assert.equal(updatePaymentReceiptSchema.safeParse({ amount: 10 }).success, true);
  });
});
