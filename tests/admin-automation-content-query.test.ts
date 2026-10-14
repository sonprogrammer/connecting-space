import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adminAutomationContentQueryKeys, fetchAdminFaqs, fetchAdminServices } from "../src/widgets/admin-automation-content/model/admin-automation-content-queries";

describe("admin automation content query cache", () => {
  test("keeps service and FAQ keys separate", () => {
    assert.notDeepEqual(adminAutomationContentQueryKeys.services.list(), adminAutomationContentQueryKeys.faqs.list());
  });

  test("uses no-store for service and FAQ reads", async () => {
    const previousFetch = globalThis.fetch;
    const caches: RequestCache[] = [];
    globalThis.fetch = (async (_input, init) => {
      if (init?.cache) caches.push(init.cache);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
    try { await fetchAdminServices(); await fetchAdminFaqs(); assert.deepEqual(caches, ["no-store", "no-store"]); }
    finally { globalThis.fetch = previousFetch; }
  });
});
