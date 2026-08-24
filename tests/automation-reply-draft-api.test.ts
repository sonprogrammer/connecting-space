import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type ReplyDraftRoute = typeof import("../src/app/api/admin/inquiries/[id]/reply-draft/route");
type VerifiedAdminResult =
  | { ok: true; supabase: SupabaseClient<Database> }
  | { ok: false; response: NextResponse };

const inquiryId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const generationRecordId = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-08-20T10:00:00.000Z";

const draftRow: Database["public"]["Tables"]["inquiry_reply_drafts"]["Row"] = {
  id: draftId,
  inquiry_id: inquiryId,
  generation_record_id: generationRecordId,
  summary: "문의 요약",
  draft_text: "답변 초안",
  needs_confirmation: [],
  status: "ready",
  last_error: null,
  updated_by: null,
  created_at: createdAt,
  updated_at: createdAt,
};

let route: ReplyDraftRoute;
let verifiedAdmin: VerifiedAdminResult | undefined;

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApiModule = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApiModule, "getVerifiedAdminSupabase", async () => {
    assert.ok(verifiedAdmin, "admin verification result must be configured");
    return verifiedAdmin;
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  route = require("../src/app/api/admin/inquiries/[id]/reply-draft/route") as ReplyDraftRoute;
});

after(() => mock.restoreAll());

describe("admin inquiry reply draft API", () => {
  test("returns provider, model, and creation time from the linked generation record", async () => {
    const fake = createTestSupabase((table) => {
      if (table === "inquiry_reply_drafts") return postgrestResponse([draftRow]);
      if (table === "notification_deliveries") return postgrestResponse([]);
      if (table === "ai_generation_records") return postgrestResponse([{
        provider: "groq",
        model: "openai/gpt-oss-120b",
        created_at: createdAt,
      }]);
      throw new Error(`Unexpected table: ${table}`);
    });
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await route.GET(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft`),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: {
      id: draftId,
      inquiryId,
      generationRecordId,
      generationRecord: {
        id: generationRecordId,
        provider: "groq",
        model: "openai/gpt-oss-120b",
        createdAt,
      },
      summary: draftRow.summary,
      draft: draftRow.draft_text,
      needsConfirmation: [],
      status: "ready",
      lastError: null,
      updatedAt: createdAt,
      slackDelivery: null,
    } });

    const generationRequest = fake.requests.find((request) => new URL(request.url).pathname.endsWith("/ai_generation_records"));
    assert.ok(generationRequest);
    const generationUrl = new URL(generationRequest.url);
    assert.equal(generationUrl.searchParams.get("select"), "provider,model,created_at");
    assert.equal(generationUrl.searchParams.get("id"), `eq.${generationRecordId}`);
  });

  test("returns a null generation record without querying history when the draft is not linked", async () => {
    const fake = createTestSupabase((table) => {
      if (table === "inquiry_reply_drafts") {
        return postgrestResponse([{ ...draftRow, generation_record_id: null }]);
      }
      if (table === "notification_deliveries") return postgrestResponse([]);
      throw new Error(`Unexpected table: ${table}`);
    });
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await route.GET(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft`),
      { params: Promise.resolve({ id: inquiryId }) },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.generationRecordId, null);
    assert.equal(body.data.generationRecord, null);
    assert.equal(fake.requests.some((request) => new URL(request.url).pathname.endsWith("/ai_generation_records")), false);
  });

  test("returns a safe error when generation metadata cannot be read", async () => {
    const fake = createTestSupabase((table) => {
      if (table === "inquiry_reply_drafts") return postgrestResponse([draftRow]);
      if (table === "notification_deliveries") return postgrestResponse([]);
      if (table === "ai_generation_records") {
        return postgrestError("XX000", "private database failure", 500);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    verifiedAdmin = { ok: true, supabase: fake.client };

    const response = await route.GET(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft`),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: "REPLY_DRAFT_READ_FAILED",
        message: "Failed to read reply draft",
      },
    });
  });
});

function createTestSupabase(responder: (table: string) => Response) {
  const requests: Array<{ url: string; method: string }> = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, method: request.method });
    const table = new URL(request.url).pathname.split("/").at(-1);
    assert.ok(table);
    return responder(table);
  };
  const client = createClient<Database>("http://supabase.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
  return { client, requests };
}

function postgrestResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function postgrestError(code: string, message: string, status: number) {
  return postgrestResponse({ code, message, details: null, hint: null }, status);
}
