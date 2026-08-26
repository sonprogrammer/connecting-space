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
const generationJobId = "44444444-4444-4444-8444-444444444444";
const createdAt = "2026-08-20T10:00:00.000Z";

const generationJob = {
  id: generationJobId,
  status: "completed" as const,
  attempt_count: 1,
  max_attempts: 3,
  available_at: createdAt,
  last_error: null,
};

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
let serviceClient: SupabaseClient<Database> | undefined;

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApiModule = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApiModule, "getVerifiedAdminSupabase", async () => {
    assert.ok(verifiedAdmin, "admin verification result must be configured");
    return verifiedAdmin;
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const supabaseModule = require("../src/shared/lib/supabase/server") as typeof import("../src/shared/lib/supabase/server");
  mock.method(supabaseModule, "createSupabaseAdminClient", () => {
    assert.ok(serviceClient, "service client must be configured");
    return serviceClient;
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  route = require("../src/app/api/admin/inquiries/[id]/reply-draft/route") as ReplyDraftRoute;
});

after(() => mock.restoreAll());

describe("admin inquiry reply draft API", () => {
  test("returns provider, model, and creation time from the linked generation record", async () => {
    const service = createTestSupabase((table) => {
      if (table === "automation_jobs") return postgrestResponse([generationJob]);
      throw new Error(`Unexpected service-role table: ${table}`);
    });
    serviceClient = service.client;
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
      generationJob: {
        id: generationJobId,
        status: "completed",
        attemptCount: 1,
        maxAttempts: 3,
        availableAt: null,
        lastError: null,
      },
      slackDelivery: null,
    } });

    const generationRequest = fake.requests.find((request) => new URL(request.url).pathname.endsWith("/ai_generation_records"));
    assert.ok(generationRequest);
    const generationUrl = new URL(generationRequest.url);
    assert.equal(generationUrl.searchParams.get("select"), "provider,model,created_at");
    assert.equal(generationUrl.searchParams.get("id"), `eq.${generationRecordId}`);
    assert.equal(fake.requests.some((request) => new URL(request.url).pathname.endsWith("/automation_jobs")), false);
    assert.equal(service.requests.some((request) => new URL(request.url).pathname.endsWith("/automation_jobs")), true);
  });

  test("returns a null generation record without querying history when the draft is not linked", async () => {
    serviceClient = createTestSupabase((table) => {
      if (table === "automation_jobs") return postgrestResponse([generationJob]);
      throw new Error(`Unexpected service-role table: ${table}`);
    }).client;
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
    serviceClient = createTestSupabase((table) => {
      if (table === "automation_jobs") return postgrestResponse([generationJob]);
      throw new Error(`Unexpected service-role table: ${table}`);
    }).client;
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

  for (const status of ["retry", "failed"] as const) {
    test(`returns ${status} generation and Slack delivery states to the admin`, async () => {
      const delivery = {
        id: "55555555-5555-4555-8555-555555555555",
        inquiry_id: inquiryId,
        draft_id: draftId,
        channel: "slack" as const,
        status,
        attempt_count: status === "retry" ? 1 : 3,
        last_error: "Slack configuration is unavailable",
        sent_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      };
      const jobRow = {
        ...generationJob,
        status,
        attempt_count: status === "retry" ? 1 : 3,
        available_at: status === "retry" ? "2026-08-20T10:01:00.000Z" : createdAt,
        last_error: "AI provider response failed (503)",
      };
      const fake = createTestSupabase((table) => {
        if (table === "inquiry_reply_drafts") {
          return postgrestResponse([{ ...draftRow, status: status === "failed" ? "failed" : "generating" }]);
        }
        if (table === "notification_deliveries") return postgrestResponse([delivery]);
        if (table === "ai_generation_records") return postgrestResponse([{
          provider: "openai",
          model: "gpt-4.1-mini",
          created_at: createdAt,
        }]);
        throw new Error(`Unexpected table: ${table}`);
      });
      serviceClient = createTestSupabase((table) => {
        if (table === "automation_jobs") return postgrestResponse([jobRow]);
        throw new Error(`Unexpected service-role table: ${table}`);
      }).client;
      verifiedAdmin = { ok: true, supabase: fake.client };

      const response = await route.GET(
        new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft`),
        { params: Promise.resolve({ id: inquiryId }) },
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body.data.generationJob.status, status);
      assert.equal(body.data.generationJob.attemptCount, status === "retry" ? 1 : 3);
      assert.equal(body.data.generationJob.availableAt, status === "retry" ? "2026-08-20T10:01:00.000Z" : null);
      assert.equal(body.data.generationJob.lastError, "AI provider response failed (503)");
      assert.equal(body.data.slackDelivery.status, status);
      assert.equal(body.data.slackDelivery.last_error, "Slack configuration is unavailable");
    });
  }
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
