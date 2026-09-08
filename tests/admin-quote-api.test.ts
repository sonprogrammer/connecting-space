import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { hashApprovalToken } from "../src/entities/quote/server/token";
import { registerPathAlias } from "./helpers/register-path-alias";

type InquiryRoute = typeof import("../src/app/api/admin/inquiries/route");
type QuotesRoute = typeof import("../src/app/api/admin/quotes/route");
type QuoteDetailRoute = typeof import("../src/app/api/admin/quotes/[id]/route");
type QuoteVersionsRoute = typeof import("../src/app/api/admin/quotes/[id]/versions/route");
type QuoteCancelRoute = typeof import("../src/app/api/admin/quotes/[id]/cancel/route");
type QuoteTokenRoute = typeof import("../src/app/api/admin/quote-versions/[id]/approval-token/route");

type VerifiedAdmin =
  | { ok: true; supabase: SupabaseClient<Database> }
  | { ok: false; response: NextResponse };

const inquiryId = "11111111-1111-4111-8111-111111111111";
const quoteId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const tokenId = "44444444-4444-4444-8444-444444444444";
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const snapshot = {
  title: "쇼핑몰 구축 견적",
  body: "반응형 쇼핑몰 구축과 운영 인계를 포함합니다.",
  scopeItems: ["상품·주문 화면", "관리자 운영 인계"],
  totalAmount: 1_000_000,
  estimatedStartDate: "2026-09-10",
  estimatedEndDate: "2026-10-10",
  depositAmount: 300_000,
  balanceAmount: 700_000,
  depositTerms: "계약 진행 전 입금",
  balanceTerms: "최종 검수 후 입금",
};

let verifiedAdmin: VerifiedAdmin;
let inquiryRoute: InquiryRoute;
let quotesRoute: QuotesRoute;
let quoteDetailRoute: QuoteDetailRoute;
let quoteVersionsRoute: QuoteVersionsRoute;
let quoteCancelRoute: QuoteCancelRoute;
let quoteTokenRoute: QuoteTokenRoute;

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApi, "getVerifiedAdminSupabase", async () => verifiedAdmin);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  inquiryRoute = require("../src/app/api/admin/inquiries/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  quotesRoute = require("../src/app/api/admin/quotes/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  quoteDetailRoute = require("../src/app/api/admin/quotes/[id]/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  quoteVersionsRoute = require("../src/app/api/admin/quotes/[id]/versions/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  quoteCancelRoute = require("../src/app/api/admin/quotes/[id]/cancel/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  quoteTokenRoute = require("../src/app/api/admin/quote-versions/[id]/approval-token/route");
});

after(() => mock.restoreAll());

describe("관리자 문의·견적 API", () => {
  test("인증되지 않은 견적 생성은 DB를 호출하지 않는다", async () => {
    verifiedAdmin = {
      ok: false,
      response: NextResponse.json(
        { error: { code: "ADMIN_AUTH_REQUIRED" } },
        { status: 401 },
      ),
    };

    const response = await quotesRoute.POST(jsonRequest("/api/admin/quotes", {
      inquiryId,
      ...snapshot,
    }));
    assert.equal(response.status, 401);
  });

  test("관리자 직접 문의에 source 기본값과 관리자 메모를 저장한다", async () => {
    const fake = createTestClient([ok({ id: inquiryId, status: "new" }, 201)]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await inquiryRoute.POST(
      jsonRequest("/api/admin/inquiries", {
        customerName: "손영진",
        serviceType: "아임웹 제작",
        message: "전화로 접수한 신규 사이트 제작 문의입니다.",
        adminNotes: "오후에 다시 연락",
      }),
    );

    assert.equal(response.status, 201);
    const inserted = JSON.parse(fake.requests[0].body);
    assert.equal(inserted.source, "admin_manual");
    assert.equal(inserted.admin_notes, "오후에 다시 연락");
  });

  test("견적과 버전 1을 하나의 RPC payload로 생성한다", async () => {
    const fake = createTestClient([
      ok([
        {
          created_quote_id: quoteId,
          created_quote_version_id: versionId,
          created_version_number: 1,
          created_status: "draft",
        },
      ]),
    ]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await quotesRoute.POST(
      jsonRequest("/api/admin/quotes", { inquiryId, ...snapshot }),
    );
    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).data, {
      quoteId,
      quoteVersionId: versionId,
      versionNumber: 1,
      status: "draft",
    });
    assert.equal(new URL(fake.requests[0].url).pathname, "/rest/v1/rpc/create_quote_with_version");
    const payload = JSON.parse(fake.requests[0].body);
    assert.equal(payload.p_inquiry_id, inquiryId);
    assert.deepEqual(payload.p_scope_items, snapshot.scopeItems);
    assert.equal(payload.p_deposit_amount, 300_000);
  });

  test("견적 상세에서 토큰 해시를 조회하거나 반환하지 않는다", async () => {
    const quote = { id: quoteId, inquiry_id: inquiryId, status: "sent" };
    const version = { id: versionId, quote_id: quoteId, version_number: 1 };
    const token = {
      id: tokenId,
      quote_version_id: versionId,
      expires_at: "2026-09-13T00:00:00Z",
      revoked_at: null,
      used_at: null,
      replaced_by_id: null,
      created_by: inquiryId,
      created_at: "2026-09-06T00:00:00Z",
    };
    const delivery = {
      id: "55555555-5555-4555-8555-555555555555", quote_id: quoteId,
      quote_version_id: versionId, approval_token_id: tokenId, generation: 1,
      status: "sent", attempt_count: 1, max_attempts: 3,
      available_at: "2026-09-06T00:00:00Z", sent_at: "2026-09-06T00:00:01Z",
      error_code: null, superseded_at: null, created_at: "2026-09-06T00:00:00Z",
    };
    const alert = { approval_token_id: tokenId, status: "queued" };
    const fake = createTestClient([ok(quote), ok([version]), ok([token]), ok([]), ok([delivery]), ok([alert])]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await quoteDetailRoute.GET(
      new NextRequest(`http://localhost/api/admin/quotes/${quoteId}`),
      context(quoteId),
    );
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.deepEqual(data.tokens, [token]);
    assert.deepEqual(data.emailDeliveries, [delivery]);
    assert.deepEqual(data.expirationAlerts, [alert]);
    const tokenRequest = fake.requests.find((request) =>
      new URL(request.url).pathname.endsWith("/quote_approval_tokens"),
    );
    assert.ok(tokenRequest);
    assert.doesNotMatch(new URL(tokenRequest.url).searchParams.get("select") ?? "", /token_hash/);
    const deliveryRequest = fake.requests.find((request) => new URL(request.url).pathname.endsWith("/quote_email_deliveries"));
    assert.ok(deliveryRequest);
    assert.doesNotMatch(new URL(deliveryRequest.url).searchParams.get("select") ?? "", /encrypted_payload|payload_nonce|payload_auth_tag|provider_message_id|locked_/);
  });
});

describe("관리자 견적 상태 변경 API", () => {
  test("새 버전 생성과 견적 취소를 전용 RPC로 처리한다", async () => {
    let fake = createTestClient([
      ok([{ created_quote_id: quoteId, created_quote_version_id: versionId, created_version_number: 2, created_status: "draft" }]),
    ]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    assert.equal(
      (await quoteVersionsRoute.POST(jsonRequest(`/api/admin/quotes/${quoteId}/versions`, snapshot), context(quoteId))).status,
      201,
    );
    assert.equal(new URL(fake.requests[0].url).pathname, "/rest/v1/rpc/create_quote_version");

    fake = createTestClient([ok([{ cancelled_quote_id: quoteId, cancelled_status: "cancelled" }])]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    assert.equal(
      (await quoteCancelRoute.POST(new NextRequest(`http://localhost/api/admin/quotes/${quoteId}/cancel`, { method: "POST" }), context(quoteId))).status,
      200,
    );
    assert.equal(new URL(fake.requests[0].url).pathname, "/rest/v1/rpc/cancel_quote");
  });

  test("토큰 원문은 응답으로만 반환하고 RPC에는 해시만 전달한다", async () => {
    const expiresAt = "2026-09-13T00:00:00Z";
    const fake = createTestClient([ok([{ issued_token_id: tokenId, issued_expires_at: expiresAt }])]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await quoteTokenRoute.POST(
      new NextRequest(`http://localhost/api/admin/quote-versions/${versionId}/approval-token`, { method: "POST" }),
      context(versionId),
    );
    assert.equal(response.status, 201);
    const data = (await response.json()).data;
    assert.match(data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(data.expiresAt, expiresAt);
    const payload = JSON.parse(fake.requests[0].body);
    assert.equal(payload.p_token_hash, hashApprovalToken(data.token));
    assert.equal(fake.requests[0].body.includes(data.token), false);
  });

  test("토큰 폐기는 원문 없이 멱등 RPC를 호출한다", async () => {
    const fake = createTestClient([ok([{ was_revoked: false }])]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await quoteTokenRoute.DELETE(
      new NextRequest(`http://localhost/api/admin/quote-versions/${versionId}/approval-token`, { method: "DELETE" }),
      context(versionId),
    );
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { revoked: false });
    assert.deepEqual(JSON.parse(fake.requests[0].body), { p_quote_version_id: versionId });
  });

  test("잘못된 견적 UUID는 인증이나 RPC 호출 전에 거부한다", async () => {
    verifiedAdmin = {
      ok: false,
      response: NextResponse.json({}, { status: 401 }),
    };
    const response = await quoteCancelRoute.POST(
      new NextRequest("http://localhost/api/admin/quotes/invalid/cancel", { method: "POST" }),
      context("invalid"),
    );
    assert.equal(response.status, 400);
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
        return responses[index++] ?? fail("XX000", "unexpected request", 500);
      },
    },
  });
  return { client, requests };
}

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fail(code: string, message: string, status: number) {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
