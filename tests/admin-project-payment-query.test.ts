import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  adminProjectPaymentQueryKeys,
  createPayment,
  createPaymentReceipt,
  paymentErrorMessage,
  updatePaymentReceipt,
} from "../src/widgets/admin-customer-projects/model/admin-project-payment-queries";

describe("admin project payment queries", () => {
  test("uses a project-scoped cache key", () => {
    assert.deepEqual(adminProjectPaymentQueryKeys.detail("project-1"), ["admin", "project-payments", "project-1"]);
    assert.notDeepEqual(adminProjectPaymentQueryKeys.detail("project-1"), adminProjectPaymentQueryKeys.detail("project-2"));
  });

  test("posts payment input using the backend camelCase contract", async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ data: { id: "payment-1" } }), { status: 201 });
    };
    try {
      await createPayment("project-1", { kind: "deposit", amount: 500000, dueDate: "2026-09-10", memo: "계약금" });
      assert.equal(request?.url, "/api/admin/projects/project-1/payments");
      assert.deepEqual(JSON.parse(String(request?.init?.body)), { kind: "deposit", amount: 500000, dueDate: "2026-09-10", memo: "계약금" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses one idempotency key for each receipt request", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: Array<{ idempotencyKey?: string }> = [];
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as { idempotencyKey?: string });
      return new Response(JSON.stringify({ data: { id: "receipt-1" } }), { status: 201 });
    };
    try {
      const idempotencyKey = crypto.randomUUID();
      await createPaymentReceipt("payment-1", { amount: 100000, idempotencyKey });
      await createPaymentReceipt("payment-1", { amount: 100000, idempotencyKey });
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0]?.idempotencyKey, idempotencyKey);
      assert.equal(bodies[1]?.idempotencyKey, idempotencyKey);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("supports receipt updates without creating a new idempotency key", async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ data: { id: "receipt-1" } }), { status: 200 });
    };
    try {
      await updatePaymentReceipt("receipt-1", { amount: 200000, memo: "수정" });
      assert.equal(request?.url, "/api/admin/payment-receipts/receipt-1");
      assert.deepEqual(JSON.parse(String(request?.init?.body)), { amount: 200000, memo: "수정" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("maps unknown mutation failures to a safe message", () => {
    assert.equal(paymentErrorMessage(new Error("secret database detail")), "결제 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });
});
