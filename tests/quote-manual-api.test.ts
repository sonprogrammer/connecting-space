import assert from "node:assert/strict";
import { after, before, beforeEach, describe, mock, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import type { ManualQuotePdfPayload } from "../src/entities/quote/server/manual-pdf";
import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type ManualRoute = typeof import("../src/app/api/admin/quote-versions/[id]/manual-delivery/route");
type VerifiedAdmin =
  | { ok: true; supabase: SupabaseClient<Database> }
  | { ok: false; response: NextResponse };

const quoteId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const inquiryId = "33333333-3333-4333-8333-333333333333";
const deliveryId = "44444444-4444-4444-8444-444444444444";
const tokenId = "55555555-5555-4555-8555-555555555555";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const context = (id: string) => ({ params: Promise.resolve({ id }) });
let verifiedAdmin: VerifiedAdmin;
let route: ManualRoute;
let renderFailure = false;
let renderedPayloads: ManualQuotePdfPayload[] = [];

before(() => {
  registerPathAlias();
  process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.QUOTE_PUBLIC_BASE_URL = "https://quotes.example.test";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApi, "getVerifiedAdminSupabase", async () => verifiedAdmin);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdf = require("../src/entities/quote/server/manual-pdf") as typeof import("../src/entities/quote/server/manual-pdf");
  mock.method(pdf, "renderManualQuotePdf", async (payload: ManualQuotePdfPayload) => {
    renderedPayloads.push(payload);
    if (renderFailure) throw new Error("sensitive renderer failure");
    return new TextEncoder().encode(`PDF:${payload.issuedAt}:${payload.expiresAt}`);
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  route = require("../src/app/api/admin/quote-versions/[id]/manual-delivery/route");
});

beforeEach(() => {
  renderFailure = false;
  renderedPayloads = [];
  process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.QUOTE_PUBLIC_BASE_URL = "https://quotes.example.test";
});

after(() => mock.restoreAll());

describe("관리자 견적 PDF 수동 발급 API", { concurrency: false }, () => {
  test("인증되지 않은 요청은 body나 DB를 처리하지 않는다", async () => {
    verifiedAdmin = { ok: false, response: NextResponse.json({}, { status: 401 }) };
    const response = await route.POST(
      new NextRequest("http://localhost/manual", { method: "POST", body: "not-json" }),
      context(versionId),
    );
    assert.equal(response.status, 401);
  });

  test("잘못된 UUID·body와 전용 설정 누락을 DB 호출 전에 거부한다", async () => {
    const fake = createTestClient([]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    assert.equal((await route.POST(jsonRequest({ idempotencyKey }), context("invalid"))).status, 400);
    assert.equal((await route.POST(jsonRequest({ idempotencyKey: "invalid" }), context(versionId))).status, 400);
    delete process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY;
    assert.equal((await route.POST(jsonRequest({ idempotencyKey }), context(versionId))).status, 503);
    assert.equal(fake.requests.length, 0);
  });

  test("PDF 생성 성공 뒤 해시만 RPC에 보내고 안전한 다운로드 응답을 반환한다", async () => {
    const delivery = manualDelivery("2026-09-08T01:00:00.000Z", "2026-09-15T01:00:00.000Z");
    const fake = createTestClient([
      ok(version()),
      ok({ customer_name: "수동 고객" }),
      ok([{ result: "created", delivery }]),
    ]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await route.POST(jsonRequest({ idempotencyKey }), context(versionId));

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-quote-manual-delivery-id"), deliveryId);
    assert.equal(response.headers.get("x-quote-expires-at"), delivery.expires_at);
    assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
    assert.equal(renderedPayloads.length, 2);
    assert.equal(renderedPayloads.at(-1)?.customerName, "수동 고객");
    assert.equal(renderedPayloads.at(-1)?.issuedAt, delivery.issued_at);
    assert.match(renderedPayloads.at(-1)?.approvalUrl ?? "", /^https:\/\/quotes\.example\.test\/quotes\/[A-Za-z0-9_-]{43}$/);

    const rpc = fake.requests.find((request) => request.url.includes("issue_quote_manual_delivery"));
    assert.ok(rpc);
    const body = JSON.parse(rpc.body);
    assert.match(body.p_token_hash, /^[0-9a-f]{64}$/);
    assert.match(body.p_idempotency_key_hash, /^[0-9a-f]{64}$/);
    assert.equal(body.p_reissue, false);
    assert.doesNotMatch(rpc.body, /quotes\.example\.test|wAAodXM|approvalUrl|p_token"/);
  });

  test("동일 키 기존 발급은 DB 시각으로 PDF를 다시 만들어 200을 반환한다", async () => {
    const delivery = manualDelivery("2026-09-07T03:00:00.000Z", "2026-09-14T03:00:00.000Z");
    const fake = createTestClient([
      ok(version()),
      ok({ customer_name: "수동 고객" }),
      ok([{ result: "existing", delivery }]),
    ]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await route.POST(jsonRequest({ idempotencyKey }), context(versionId));

    assert.equal(response.status, 200);
    assert.equal(renderedPayloads.length, 2);
    assert.equal(renderedPayloads[1].issuedAt, delivery.issued_at);
    assert.equal(renderedPayloads[1].expiresAt, delivery.expires_at);
    assert.equal(
      Buffer.from(await response.arrayBuffer()).toString(),
      `PDF:${delivery.issued_at}:${delivery.expires_at}`,
    );
  });

  test("명시적 재발급과 상태 충돌을 구분한다", async () => {
    let fake = createTestClient([
      ok(version()), ok({ customer_name: "수동 고객" }),
      ok([{ result: "created", delivery: manualDelivery("2026-09-08T02:00:00.000Z", "2026-09-15T02:00:00.000Z") }]),
    ]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    assert.equal((await route.POST(jsonRequest({ idempotencyKey, reissue: true }), context(versionId))).status, 201);
    assert.equal(JSON.parse(fake.requests.at(-1)?.body ?? "{}").p_reissue, true);

    fake = createTestClient([ok(version()), ok({ customer_name: "수동 고객" }), fail("P0001", "sensitive", 400)]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    const conflict = await route.POST(jsonRequest({ idempotencyKey }), context(versionId));
    assert.equal(conflict.status, 409);
    assert.doesNotMatch(JSON.stringify(await conflict.json()), /sensitive|token|quotes\.example/);
  });

  test("PDF 렌더링 실패 시 토큰·상태 RPC를 호출하지 않는다", async () => {
    renderFailure = true;
    const fake = createTestClient([ok(version()), ok({ customer_name: "수동 고객" })]);
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await route.POST(jsonRequest({ idempotencyKey }), context(versionId));

    assert.equal(response.status, 500);
    assert.equal(fake.requests.some((request) => request.url.includes("/rpc/")), false);
    assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive/);
  });
});

function version() {
  return {
    id: versionId,
    quote_id: quoteId,
    version_number: 1,
    title: "수동 견적",
    body: "수동 발급 본문",
    scope_items: ["기획", "개발"],
    total_amount: 1_000_000,
    estimated_start_date: "2026-09-10",
    estimated_end_date: "2026-10-10",
    deposit_amount: 300_000,
    balance_amount: 700_000,
    deposit_terms: "착수 전",
    balance_terms: "검수 후",
    quotes: { id: quoteId, inquiry_id: inquiryId, status: "draft", latest_version_id: versionId },
  };
}

function manualDelivery(issuedAt: string, expiresAt: string) {
  return {
    id: deliveryId,
    quote_id: quoteId,
    quote_version_id: versionId,
    approval_token_id: tokenId,
    generation: 1,
    idempotency_key_hash: "a".repeat(64),
    issued_at: issuedAt,
    expires_at: expiresAt,
    superseded_at: null,
    created_by: inquiryId,
    created_at: issuedAt,
  };
}

type CapturedRequest = { url: string; body: string };
function createTestClient(responses: Response[]) {
  let index = 0;
  const requests: CapturedRequest[] = [];
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      requests.push({
        url: input instanceof Request ? input.url : String(input),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return responses[index++] ?? fail("XX000", "unexpected request", 500);
    } },
  });
  return { client, requests };
}

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ok(data: unknown) {
  return Response.json(data);
}

function fail(code: string, message: string, status: number) {
  return Response.json({ code, message, details: null, hint: null }, { status });
}
