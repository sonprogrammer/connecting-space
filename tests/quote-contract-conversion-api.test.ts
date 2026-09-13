import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test, mock } from "node:test";
import { NextRequest } from "next/server";

import { registerPathAlias } from "./helpers/register-path-alias";
import type { createSupabaseServerClient } from "../src/shared/lib/supabase/server";

describe("quote contract conversion API", () => {
  let route: typeof import("../src/app/api/admin/quote-versions/[id]/confirm-contract/route");
  let adminResult: { ok: true; supabase: ReturnType<typeof createSupabaseServerClient> } | { ok: false; response: Response };
  let rpcArgs: Record<string, unknown> | undefined;

  before(() => {
    registerPathAlias();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const auth = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
    mock.method(auth, "getVerifiedAdminSupabase", async () => adminResult);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    route = require("../src/app/api/admin/quote-versions/[id]/confirm-contract/route") as typeof route;
  });
  beforeEach(() => {
    rpcArgs = undefined;
    adminResult = { ok: true, supabase: {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "22222222-2222-4222-8222-222222222222", quote_id: "33333333-3333-4333-8333-333333333333", title: "제작", total_amount: 101, estimated_end_date: "2026-10-01", quotes: { inquiry_id: "11111111-1111-4111-8111-111111111111" } }, error: null }) }) }) }),
      rpc: async (_name: string, args: Record<string, unknown>) => { rpcArgs = args; return { data: [{ result: "created", confirmation: { id: "44444444-4444-4444-8444-444444444444", quote_id: "33333333-3333-4333-8333-333333333333", quote_version_id: "22222222-2222-4222-8222-222222222222", customer_id: "55555555-5555-4555-8555-555555555555", project_id: "66666666-6666-4666-8666-666666666666", deposit_payment_id: "77777777-7777-4777-8777-777777777777", balance_payment_id: "88888888-8888-4888-8888-888888888888" } }], error: null }; },
    } as unknown as ReturnType<typeof createSupabaseServerClient> };
  });
  after(() => mock.restoreAll());

  test("authenticates before parsing and sends hashed idempotency with calculated payments", async () => {
    const response = await route.POST(new NextRequest("http://localhost/api/admin/quote-versions/22222222-2222-4222-8222-222222222222/confirm-contract", { method: "POST", body: JSON.stringify({ idempotencyKey: "11111111-1111-4111-8111-111111111111", confirmedAt: "2026-09-12T10:00:00+09:00" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
    assert.equal(response.status, 201);
    assert.equal(rpcArgs?.p_deposit_amount, 30);
    assert.equal(rpcArgs?.p_balance_amount, 71);
    assert.notEqual(rpcArgs?.p_idempotency_key_hash, "11111111-1111-4111-8111-111111111111");
  });

  test("rejects unauthenticated request without reading or mutating", async () => {
    adminResult = { ok: false, response: Response.json({ error: { code: "ADMIN_AUTH_REQUIRED" } }, { status: 401 }) };
    const response = await route.POST(new NextRequest("http://localhost/api/admin/quote-versions/not-a-uuid/confirm-contract", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "not-a-uuid" }) });
    assert.equal(response.status, 401);
    assert.equal(rpcArgs, undefined);
  });
});
