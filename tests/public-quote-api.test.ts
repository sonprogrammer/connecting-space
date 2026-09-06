import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { hashApprovalToken } from "../src/entities/quote/server/token";
import { registerPathAlias } from "./helpers/register-path-alias";

type PublicQuoteRoute = typeof import("../src/app/api/quotes/[token]/route");
type PublicApproveRoute = typeof import("../src/app/api/quotes/[token]/approve/route");

const quoteId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const token = Buffer.alloc(32, 7).toString("base64url");
const context = (value: string) => ({ params: Promise.resolve({ token: value }) });

let publicClient: SupabaseClient<Database>;
let quoteRoute: PublicQuoteRoute;
let approveRoute: PublicApproveRoute;

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const server = require("../src/shared/lib/supabase/server") as typeof import("../src/shared/lib/supabase/server");
  mock.method(server, "createSupabaseServerClient", () => publicClient);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  quoteRoute = require("../src/app/api/quotes/[token]/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  approveRoute = require("../src/app/api/quotes/[token]/approve/route");
});

after(() => mock.restoreAll());

describe("공개 견적 조회 API", () => {
  test("형식이 잘못된 토큰은 DB를 호출하지 않고 거부한다", async () => {
    const fake = createTestClient([]);
    publicClient = fake.client;

    const response = await quoteRoute.GET(
      new NextRequest("http://localhost/api/quotes/invalid"),
      context("invalid"),
    );
    assert.equal(response.status, 404);
    assert.equal(fake.requests.length, 0);
  });

  test("GET은 읽기 RPC만 호출하고 허용된 고객 표시 정보와 스냅샷만 반환한다", async () => {
    const row = {
      availability: "available",
      quote_id: quoteId,
      quote_version_id: versionId,
      version_number: 1,
      customer_name: "고객 이름",
      title: "쇼핑몰 구축 견적",
      body: "견적 본문",
      scope_items: ["상품·주문 화면"],
      total_amount: 1_000_000,
      estimated_start_date: "2026-09-10",
      estimated_end_date: "2026-10-10",
      deposit_amount: 300_000,
      balance_amount: 700_000,
      deposit_terms: "진행 전",
      balance_terms: "검수 후",
      expires_at: "2026-09-14T00:00:00Z",
    };
    const fake = createTestClient([ok([row])]);
    publicClient = fake.client;

    const response = await quoteRoute.GET(
      new NextRequest(`http://localhost/api/quotes/${token}`),
      context(token),
    );
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      quoteId,
      quoteVersionId: versionId,
      versionNumber: 1,
      customerName: "고객 이름",
      title: "쇼핑몰 구축 견적",
      body: "견적 본문",
      scopeItems: ["상품·주문 화면"],
      totalAmount: 1_000_000,
      estimatedStartDate: "2026-09-10",
      estimatedEndDate: "2026-10-10",
      depositAmount: 300_000,
      balanceAmount: 700_000,
      depositTerms: "진행 전",
      balanceTerms: "검수 후",
      expiresAt: "2026-09-14T00:00:00Z",
    });
    assert.equal(new URL(fake.requests[0].url).pathname, "/rest/v1/rpc/get_public_quote_by_token");
    assert.deepEqual(JSON.parse(fake.requests[0].body), {
      p_token_hash: hashApprovalToken(token),
    });
  });

  test("만료된 토큰은 고객 정보 없이 410을 반환한다", async () => {
    const fake = createTestClient([ok([{ availability: "expired", customer_name: null }])]);
    publicClient = fake.client;
    const response = await quoteRoute.GET(
      new NextRequest(`http://localhost/api/quotes/${token}`),
      context(token),
    );
    assert.equal(response.status, 410);
    const body = await response.json();
    assert.equal(body.error.code, "QUOTE_LINK_EXPIRED");
    assert.equal(JSON.stringify(body).includes("customer"), false);
  });
});

describe("공개 견적 승인 API", () => {
  test("POST는 해시와 제한된 감사 정보만 원자 승인 RPC에 전달한다", async () => {
    const approvedAt = "2026-09-07T00:00:00Z";
    const fake = createTestClient([
      ok([{ result: "approved", approved_quote_id: quoteId, approved_quote_version_id: versionId, approved_at: approvedAt }]),
    ]);
    publicClient = fake.client;
    const response = await approveRoute.POST(
      new NextRequest(`http://localhost/api/quotes/${token}/approve`, {
        method: "POST",
        headers: {
          "user-agent": "Test Browser",
          "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
      }),
      context(token),
    );

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { quoteId, quoteVersionId: versionId, approvedAt });
    assert.equal(new URL(fake.requests[0].url).pathname, "/rest/v1/rpc/approve_quote_by_token");
    assert.deepEqual(JSON.parse(fake.requests[0].body), {
      p_token_hash: hashApprovalToken(token),
      p_client_ip: "203.0.113.10",
      p_user_agent: "Test Browser",
    });
  });

  test("이미 사용할 수 없는 토큰은 내부 상태를 숨긴 충돌 응답을 반환한다", async () => {
    const fake = createTestClient([ok([{ result: "unavailable" }])]);
    publicClient = fake.client;
    const response = await approveRoute.POST(
      new NextRequest(`http://localhost/api/quotes/${token}/approve`, { method: "POST" }),
      context(token),
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: {
        code: "QUOTE_APPROVAL_UNAVAILABLE",
        message: "Quote approval is unavailable",
      },
    });
  });
});

type CapturedRequest = { url: string; method: string; body: string };

function createTestClient(responses: Response[]) {
  let index = 0;
  const requests: CapturedRequest[] = [];
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        requests.push({
          url: input instanceof Request ? input.url : String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : "",
        });
        return responses[index++] ?? fail("XX000", "sensitive", 500);
      },
    },
  });
  return { client, requests };
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fail(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
