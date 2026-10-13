import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { QueryClient } from "@tanstack/query-core";

import * as inquiryQueries from "../src/widgets/admin-dashboard/model/admin-inquiry-queries";

describe("admin inquiry query cache", () => {
  test("separates list and inquiry detail keys by id", () => {
    const keys = inquiryQueries.adminInquiryQueryKeys;
    assert.notDeepEqual(keys.list(), keys.detail("inquiry-a"));
    assert.notDeepEqual(keys.detail("inquiry-a"), keys.detail("inquiry-b"));
  });

  test("reuses a successful list query when returning A → B → A", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [];
    };
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    const options = (scope: string) => ({
      queryKey: inquiryQueries.adminInquiryQueryKeys.list(scope),
      queryFn: fetcher,
    });

    await client.fetchQuery(options("A"));
    await client.fetchQuery(options("B"));
    await client.fetchQuery(options("A"));

    assert.equal(calls, 2);
    client.clear();
  });

  test("GET fetchers preserve no-store and redirect-worthy status in their error", async () => {
    const fetcher = inquiryQueries.fetchAdminInquiryList;
    let requestCache: RequestCache | undefined;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      requestCache = init?.cache;
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await fetcher();
      assert.equal(requestCache, "no-store");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
