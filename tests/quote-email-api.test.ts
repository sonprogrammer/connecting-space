import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type SendRoute = typeof import("../src/app/api/admin/quote-versions/[id]/send/route");
type RetryRoute = typeof import("../src/app/api/admin/quote-email-jobs/[id]/retry/route");
type VerifiedAdmin = { ok: true; supabase: SupabaseClient<Database> } | { ok: false; response: NextResponse };

const quoteId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const inquiryId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const tokenId = "55555555-5555-4555-8555-555555555555";
const context = (id: string) => ({ params: Promise.resolve({ id }) });
let verifiedAdmin: VerifiedAdmin;
let sendRoute: SendRoute;
let retryRoute: RetryRoute;

before(() => {
  registerPathAlias();
  process.env.RESEND_API_KEY = "test-key";
  process.env.RESEND_FROM_EMAIL = "sender@example.invalid";
  process.env.QUOTE_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
  process.env.QUOTE_PUBLIC_BASE_URL = "https://public.example.test";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApi, "getVerifiedAdminSupabase", async () => verifiedAdmin);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sendRoute = require("../src/app/api/admin/quote-versions/[id]/send/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  retryRoute = require("../src/app/api/admin/quote-email-jobs/[id]/retry/route");
});

after(() => mock.restoreAll());

describe("관리자 견적 이메일 API", { concurrency: false }, () => {
  test("인증되지 않은 /send 요청은 DB를 호출하지 않는다", async () => {
    verifiedAdmin = { ok: false, response: NextResponse.json({}, { status: 401 }) };
    const response = await sendRoute.POST(new NextRequest("http://localhost/send", { method: "POST" }), context(versionId));
    assert.equal(response.status, 401);
  });

  test("유효한 수신 이메일이 없으면 토큰이나 작업을 만들지 않는다", async () => {
    const fake = createTestClient([ok({ ...version(), quotes: { id: quoteId, inquiry_id: inquiryId, status: "draft", latest_version_id: versionId } }), ok({ customer_name: "고객", email: null })]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    const response = await sendRoute.POST(new NextRequest("http://localhost/send", { method: "POST" }), context(versionId));
    assert.equal(response.status, 400);
    assert.equal(fake.requests.some((item) => item.url.includes("enqueue_quote_email_delivery")), false);
  });

  test("새 작업은 202이며 응답과 RPC body에 평문 비밀을 노출하지 않는다", async () => {
    const delivery = row("queued");
    const fake = createTestClient([
      ok({ ...version(), quotes: { id: quoteId, inquiry_id: inquiryId, status: "draft", latest_version_id: versionId } }),
      ok({ customer_name: "고객", email: "qa@example.invalid" }),
      ok([{ result: "created", delivery }]),
    ]);
    verifiedAdmin = { ok: true, supabase: fake.client };
    const response = await sendRoute.POST(new NextRequest("http://localhost/send", { method: "POST" }), context(versionId));
    assert.equal(response.status, 202);
    const serialized = JSON.stringify(await response.json());
    assert.doesNotMatch(serialized, /qa@example\.invalid|\/quotes\/|token/);
    const rpcBody = fake.requests.at(-1)?.body ?? "";
    assert.doesNotMatch(rpcBody, /qa@example\.invalid|\/quotes\//);
    assert.match(rpcBody, /p_encrypted_payload/);
  });

  test("중복 작업은 200, 최종 실패 작업은 409를 반환한다", async () => {
    for (const [result, expected] of [["existing", 200], ["retry_required", 409]] as const) {
      const fake = createTestClient([
        ok({ ...version(), quotes: { id: quoteId, inquiry_id: inquiryId, status: "draft", latest_version_id: versionId } }),
        ok({ customer_name: "고객", email: "qa@example.invalid" }),
        ok([{ result, delivery: row(result === "existing" ? "queued" : "failed") }]),
      ]);
      verifiedAdmin = { ok: true, supabase: fake.client };
      const response = await sendRoute.POST(new NextRequest("http://localhost/send", { method: "POST" }), context(versionId));
      assert.equal(response.status, expected);
    }
  });

  test("retry는 같은 작업을 재활성화하고 재발급 필요 상태를 구분한다", async () => {
    for (const [result, expected] of [["requeued", 202], ["existing", 200], ["reissue_required", 409], ["not_found", 404]] as const) {
      const fake = createTestClient([ok([{ result, delivery: row(result === "requeued" ? "queued" : "failed") }])]);
      verifiedAdmin = { ok: true, supabase: fake.client };
      const response = await retryRoute.POST(new NextRequest("http://localhost/retry", { method: "POST" }), context(jobId));
      assert.equal(response.status, expected);
      if (expected < 300) assert.equal((await response.json()).data.jobId, jobId);
    }
  });
});

function version() {
  return { id: versionId, quote_id: quoteId, version_number: 1, title: "견적", body: "본문", scope_items: ["개발"], total_amount: 1000, estimated_start_date: null, estimated_end_date: null, deposit_amount: 300, balance_amount: 700, deposit_terms: "선금", balance_terms: "잔금" };
}

function row(status: Database["public"]["Enums"]["quote_delivery_status"]) {
  return { id: jobId, quote_id: quoteId, quote_version_id: versionId, approval_token_id: tokenId, generation: 1, status, attempt_count: 0, max_attempts: 3, available_at: "2026-09-07T00:00:00Z", sent_at: null, error_code: null };
}

type CapturedRequest = { url: string; body: string };
function createTestClient(responses: Response[]) {
  let index = 0;
  const requests: CapturedRequest[] = [];
  const client = createClient<Database>("https://example.supabase.co", "test-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    requests.push({ url: input instanceof Request ? input.url : String(input), body: typeof init?.body === "string" ? init.body : "" });
    return responses[index++] ?? ok({ code: "XX000" }, 500);
  } } });
  return { client, requests };
}
function ok(data: unknown, status = 200) { return Response.json(data, { status }); }
