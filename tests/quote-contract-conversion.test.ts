import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { calculateContractPayments } from "../src/entities/quote/server/contract-conversion";
import { confirmQuoteContractSchema } from "../src/entities/quote/api/contract-conversion";

describe("quote contract conversion calculation", () => {
  test("splits odd totals into exact integer sum with 30/70 defaults", () => {
    assert.deepEqual(calculateContractPayments({ totalAmount: 101, confirmedDate: "2026-09-12", estimatedEndDate: "2026-10-01" }), {
      depositAmount: 30, balanceAmount: 71, depositDueDate: "2026-09-12", balanceDueDate: "2026-10-01",
    });
  });

  test("accepts percentage override and allocates remainder to balance", () => {
    assert.deepEqual(calculateContractPayments({ totalAmount: 1_000_001, confirmedDate: "2026-09-12", estimatedEndDate: null, depositPercentage: 25, balancePercentage: 75 }), {
      depositAmount: 250_000, balanceAmount: 750_001, depositDueDate: "2026-09-12", balanceDueDate: null,
    });
  });

  test("rejects inconsistent amount and percentage overrides", () => {
    assert.throws(() => calculateContractPayments({ totalAmount: 100, confirmedDate: "2026-09-12", estimatedEndDate: null, depositAmount: 40, balanceAmount: 60, depositPercentage: 30, balancePercentage: 70 }), /OVERRIDE/);
  });
});

describe("confirm quote contract schema", () => {
  test("requires idempotency key and confirmation timestamp", () => {
    assert.equal(confirmQuoteContractSchema.safeParse({}).success, false);
    assert.equal(confirmQuoteContractSchema.safeParse({ idempotencyKey: "not-uuid", confirmedAt: "bad" }).success, false);
  });
});
