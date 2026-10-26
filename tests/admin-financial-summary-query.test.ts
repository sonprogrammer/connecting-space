import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const queries = require("../src/entities/payment/model/admin-financial-summary-queries") as typeof import("../src/entities/payment/model/admin-financial-summary-queries");

const responseData = {
  asOf: "2026-10-25T00:00:00.000Z",
  status: "active",
  includedStatuses: ["planning", "in_progress", "review", "paused"],
  projectCount: 2,
  expectedRevenue: 100,
  confirmedRevenue: 80,
  receivedTotal: 20,
  outstanding: 60,
};

describe("admin financial summary queries", () => {
  test("financial summary keys vary by status", () => {
    assert.deepEqual(queries.adminFinancialSummaryQueryKeys.byStatus("active"), ["admin", "financial-summary", "active"]);
    assert.notDeepEqual(queries.adminFinancialSummaryQueryKeys.byStatus("active"), queries.adminFinancialSummaryQueryKeys.byStatus("all"));
    assert.deepEqual(queries.adminFinancialSummaryQueryOptions("planning").queryKey, queries.adminFinancialSummaryQueryKeys.byStatus("planning"));
  });

  test("financial summary fetch validates the API envelope and uses no-store", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      request = { url: String(input), init };
      return new Response(JSON.stringify({ data: responseData }), { status: 200 });
    };

    assert.deepEqual(await queries.fetchAdminFinancialSummary("active", fetcher), responseData);
    assert.equal(request?.url, "/api/admin/financial-summary?status=active");
    assert.equal(request?.init?.cache, "no-store");
    assert.equal(request?.init?.headers && new Headers(request.init.headers).get("Accept"), "application/json");
  });

  test("financial summary fetch preserves 401 and 403 status", async () => {
    for (const status of [401, 403]) {
      const fetcher: typeof fetch = async () => new Response(JSON.stringify({ error: { code: "ADMIN_AUTH_REQUIRED", message: "Denied" } }), { status });
      await assert.rejects(queries.fetchAdminFinancialSummary("active", fetcher), (error: unknown) => {
        assert.equal((error as { status?: number }).status, status);
        return true;
      });
    }
  });
});
