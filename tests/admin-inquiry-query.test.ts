import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { QueryClient } from "@tanstack/query-core";

import * as inquiryQueries from "../src/widgets/admin-dashboard/model/admin-inquiry-queries";
import * as quoteWorkflowQueries from "../src/widgets/admin-quote-workflow/model/admin-quote-workflow-queries";

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

  test("coalesces dashboard and quote workflow inquiry list requests", async () => {
    const previousFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    try {
      const [dashboardInquiries, quoteInquiries] = await Promise.all([
        client.fetchQuery({
          queryKey: inquiryQueries.adminInquiryQueryKeys.list(),
          queryFn: inquiryQueries.fetchAdminInquiryList,
        }),
        client.fetchQuery({
          queryKey: quoteWorkflowQueries.adminQuoteKeys.inquiries,
          queryFn: quoteWorkflowQueries.fetchAdminInquiries,
        }),
      ]);

      assert.deepEqual(quoteWorkflowQueries.adminQuoteKeys.inquiries, inquiryQueries.adminInquiryQueryKeys.list());
      assert.equal(quoteWorkflowQueries.fetchAdminInquiries, inquiryQueries.fetchAdminInquiryList);
      assert.deepEqual(dashboardInquiries, quoteInquiries);
      assert.equal(calls, 1);
    } finally {
      client.clear();
      globalThis.fetch = previousFetch;
    }
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

  test("renders refresh warnings and retry actions for cached list and detail failures", () => {
    const source = readFileSync("src/widgets/admin-dashboard/ui/admin-inquiry-list.tsx", "utf8");
    assert.match(source, /getCachedQueryListState\(/);
    assert.match(source, /getCachedQueryState\(/);
    assert.match(source, /<QueryRefreshNotice message=\{state\.warning\}/);
    assert.match(source, /onRetry:\s*\(\)\s*=>\s*void detailQuery\.refetch\(\)/);
    assert.match(source, /onRetry=\{\(\)\s*=>\s*void inquiriesQuery\.refetch\(\)\}/);
  });
});
