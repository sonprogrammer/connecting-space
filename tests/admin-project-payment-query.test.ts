import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  adminProjectPaymentQueryKeys,
  createPayment,
  createPaymentReceipt,
  paymentErrorMessage,
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
    let body: { idempotencyKey?: string } | undefined;
    globalThis.fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as { idempotencyKey?: string };
      return new Response(JSON.stringify({ data: { id: "receipt-1" } }), { status: 201 });
    };
    try {
      await createPaymentReceipt("payment-1", { amount: 100000 });
      assert.match(body?.idempotencyKey ?? "", /^[0-9a-f-]{36}$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("maps unknown mutation failures to a safe message", () => {
    assert.equal(paymentErrorMessage(new Error("secret database detail")), "결제 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });
});
