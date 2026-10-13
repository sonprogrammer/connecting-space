import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adminPortfolioQueryKeys, fetchAdminPortfolioList } from "../src/widgets/admin-portfolio/model/admin-portfolio-queries";

describe("admin portfolio query cache", () => {
  test("uses a dedicated list key and no-store GET", async () => {
    assert.notDeepEqual(adminPortfolioQueryKeys.list(), ["admin", "inquiries", "list"]);
    const previousFetch = globalThis.fetch;
    let cache: RequestCache | undefined;
    globalThis.fetch = (async (_input, init) => {
      cache = init?.cache;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
    try { assert.deepEqual(await fetchAdminPortfolioList(), []); assert.equal(cache, "no-store"); }
    finally { globalThis.fetch = previousFetch; }
  });
});
