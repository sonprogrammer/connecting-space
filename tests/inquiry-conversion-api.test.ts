import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
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

  before(() => {
    registerPathAlias();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
    mock.method(adminApi, "getVerifiedAdminSupabase", async () => ({
      ok: true as const,
      supabase: {
        rpc: async (_name: string, args: Record<string, unknown>) => {
          rpcArgs = args;
          return { data: [{ inquiry_id: "11111111-1111-4111-8111-111111111111", customer_id: "22222222-2222-4222-8222-222222222222", project_id: "33333333-3333-4333-8333-333333333333", reused_customer: false, reused_project: false }], error: null };
        },
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require("../src/app/api/admin/inquiries/[id]/convert/route") as typeof route;
  });

  after(() => mock.restoreAll());

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
});
