import assert from "node:assert/strict";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { NextRequest } from "next/server";

import { convertInquirySchema } from "../src/entities/inquiry/api/conversion-contracts";
import { registerPathAlias } from "./helpers/register-path-alias";

const valid = {
  customerName: "손영진",
  customerMemo: "메모",
  projectName: "아임웹 제작",
  contractAmount: 1200000,
  expectedLaunchDate: "2026-10-01",
  projectMemo: "프로젝트 메모",
};

describe("inquiry conversion contract", () => {
  test("normalizes a valid conversion payload", () => {
    const result = convertInquirySchema.safeParse({ ...valid, customerName: "  손영진  " });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.customerName, "손영진");
  });

  test("rejects negative amounts and invalid dates", () => {
    assert.equal(convertInquirySchema.safeParse({ ...valid, contractAmount: -1 }).success, false);
    assert.equal(convertInquirySchema.safeParse({ ...valid, expectedLaunchDate: "2026/10/01" }).success, false);
  });
});

describe("inquiry conversion route", () => {
  let route: typeof import("../src/app/api/admin/inquiries/[id]/convert/route");
  let rpcArgs: Record<string, unknown> | undefined;
  let adminResult: { ok: true; supabase: { rpc: (...args: never[]) => Promise<unknown> } } | { ok: false; response: Response };
  let rpcResult: { data: unknown[] | null; error: { code?: string } | null };

  before(() => {
    registerPathAlias();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
    adminResult = { ok: true, supabase: { rpc: async (_name, args) => { rpcArgs = args; return rpcResult; } } };
    mock.method(adminApi, "getVerifiedAdminSupabase", async () => adminResult);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require("../src/app/api/admin/inquiries/[id]/convert/route") as typeof route;
  });

  after(() => mock.restoreAll());
  beforeEach(() => {
    rpcArgs = undefined;
    rpcResult = { data: [{ inquiry_id: "11111111-1111-4111-8111-111111111111", customer_id: "22222222-2222-4222-8222-222222222222", project_id: "33333333-3333-4333-8333-333333333333", reused_customer: false, reused_project: false }], error: null };
    adminResult = { ok: true, supabase: { rpc: async (_name, args) => { rpcArgs = args; return rpcResult; } } };
  });

  test("calls one RPC and returns conversion IDs", async () => {
    const response = await route.POST(
      new NextRequest("http://localhost/api/admin/inquiries/11111111-1111-4111-8111-111111111111/convert", {
        method: "POST",
        body: JSON.stringify({ customerName: "손영진", customerMemo: "", projectName: "제작", contractAmount: 0, expectedLaunchDate: "", projectMemo: "" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.customer_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(rpcArgs?.p_inquiry_id, "11111111-1111-4111-8111-111111111111");
  });

  test("rejects unauthenticated requests without calling RPC", async () => {
    adminResult = { ok: false, response: Response.json({ error: { code: "ADMIN_AUTH_REQUIRED" } }, { status: 401 }) };
    const response = await route.POST(new NextRequest("http://localhost/api/admin/inquiries/id/convert", { method: "POST" }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    assert.equal(response.status, 401);
    assert.equal(rpcArgs, undefined);
  });

  test("maps invalid UUID and payload to 400 without calling RPC", async () => {
    const invalidId = await route.POST(new NextRequest("http://localhost/api/admin/inquiries/not-a-uuid/convert", { method: "POST" }), { params: Promise.resolve({ id: "not-a-uuid" }) });
    assert.equal(invalidId.status, 400);
    const invalidPayload = await route.POST(new NextRequest("http://localhost/api/admin/inquiries/11111111-1111-4111-8111-111111111111/convert", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    assert.equal(invalidPayload.status, 400);
    assert.equal(rpcArgs, undefined);
  });

  test("maps RPC errors and empty responses to stable domain errors", async () => {
    for (const [code, status, expected] of [["P0002", 404, "INQUIRY_NOT_FOUND"], ["42501", 403, "ADMIN_AUTH_REQUIRED"], ["XX000", 500, "INQUIRY_CONVERSION_FAILED"]] as const) {
      rpcResult = { data: null, error: { code } };
      const response = await route.POST(validRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
      assert.equal(response.status, status);
      assert.equal((await response.json()).error.code, expected);
    }
    rpcResult = { data: [], error: null };
    const empty = await route.POST(validRequest(), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    assert.equal(empty.status, 500);
    assert.equal((await empty.json()).error.code, "INQUIRY_CONVERSION_FAILED");
  });

  function validRequest() {
    return new NextRequest("http://localhost/api/admin/inquiries/11111111-1111-4111-8111-111111111111/convert", { method: "POST", body: JSON.stringify({ customerName: "손영진", customerMemo: "", projectName: "제작", contractAmount: 0, expectedLaunchDate: "", projectMemo: "" }), headers: { "content-type": "application/json" } });
  }
});
