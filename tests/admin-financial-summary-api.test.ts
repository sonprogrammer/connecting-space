import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { registerPathAlias } from "./helpers/register-path-alias";
import { jsonError } from "../src/shared/api/response";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require("../src/app/api/admin/financial-summary/route") as typeof import("../src/app/api/admin/financial-summary/route");

const snapshot = {
  asOf: "2026-10-25T00:00:00.000Z", status: "active",
  includedStatuses: ["planning", "in_progress", "review", "paused"], projectCount: 0,
  expectedRevenue: 0, confirmedRevenue: 0, receivedTotal: 0, outstanding: 0,
};

test("financial API authenticates first and preserves 401/403", async () => {
  for (const status of [401, 403]) {
    const auth = mock.method(adminApi, "getVerifiedAdminSupabase", async () => ({
      ok: false as const, response: jsonError("ADMIN_AUTH_REQUIRED", "Denied", status),
    }));
    try {
      const response = await route.GET(new NextRequest("http://localhost/api/admin/financial-summary?status=invalid"));
      assert.equal(response.status, status);
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    } finally { auth.mock.restore(); }
  }
});

test("financial API validates query and uses one RPC with private no-store", async () => {
  const calls: unknown[] = [];
  const auth = mock.method(adminApi, "getVerifiedAdminSupabase", async () => ({
    ok: true as const, supabase: { rpc: async (...args: unknown[]) => {
      calls.push(args); return { data: snapshot, error: null };
    } } as never,
  }));
  try {
    for (const query of ["status=bad", "status=planning&status=review", "page=1"]) {
      assert.equal((await route.GET(new NextRequest(`http://localhost/api/admin/financial-summary?${query}`))).status, 400);
    }
    assert.equal(calls.length, 0);
    const response = await route.GET(new NextRequest("http://localhost/api/admin/financial-summary"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { data: snapshot });
    assert.deepEqual(calls, [["get_admin_financial_summary", { p_status: "active" }]]);
  } finally { auth.mock.restore(); }
});

test("financial API hides provider errors and rejects unsafe aggregate numbers", async () => {
  for (const result of [
    { data: null, error: { message: "private database detail" } },
    { data: { ...snapshot, expectedRevenue: Number.MAX_SAFE_INTEGER + 1 }, error: null },
  ]) {
    const auth = mock.method(adminApi, "getVerifiedAdminSupabase", async () => ({
      ok: true as const, supabase: { rpc: async () => result } as never,
    }));
    try {
      const response = await route.GET(new NextRequest("http://localhost/api/admin/financial-summary"));
      assert.equal(response.status, 500);
      assert.equal((await response.json()).error.code, "ADMIN_FINANCIAL_SUMMARY_READ_FAILED");
    } finally { auth.mock.restore(); }
  }
});
