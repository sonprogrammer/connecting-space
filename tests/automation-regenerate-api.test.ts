import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type RegenerateRoute = typeof import("../src/app/api/admin/inquiries/[id]/reply-draft/regenerate/route");

const inquiryId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";

let route: RegenerateRoute;
let scheduledWork: (() => Promise<void>) | undefined;
let processCalls = 0;
let serviceClient: SupabaseClient<Database>;

before(() => {
  registerPathAlias();
  const adminClient = createFakeClient((request) => {
    assert.equal(request.method, "GET");
    return jsonResponse([{ id: inquiryId }]);
  });
  serviceClient = createFakeClient(async (request) => {
    const resource = new URL(request.url).pathname.split("/").at(-1);
    if (resource === "enqueue_automation_job") return jsonResponse(jobId);
    if (resource === "inquiry_reply_drafts") return new Response(null, { status: 201 });
    throw new Error(`Unexpected service request: ${request.method} ${request.url}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApiModule = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApiModule, "getVerifiedAdminSupabase", async () => ({ ok: true, supabase: adminClient }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const supabaseModule = require("../src/shared/lib/supabase/server") as typeof import("../src/shared/lib/supabase/server");
  mock.method(supabaseModule, "createSupabaseAdminClient", () => serviceClient);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const processorModule = require("../src/shared/lib/automation/processor") as typeof import("../src/shared/lib/automation/processor");
  mock.method(processorModule, "processAutomationJobs", async () => {
    processCalls += 1;
    return [];
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextServerModule = require("next/server") as typeof import("next/server");
  mock.method(nextServerModule, "after", (work: () => Promise<void>) => {
    scheduledWork = work;
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  route = require("../src/app/api/admin/inquiries/[id]/reply-draft/regenerate/route") as RegenerateRoute;
});

after(() => mock.restoreAll());

describe("reply draft regeneration API", () => {
  test("enqueues regeneration and schedules immediate worker processing", async () => {
    const response = await route.POST(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft/regenerate`, { method: "POST" }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { data: { jobId, status: "pending" } });
    assert.ok(scheduledWork, "regeneration must schedule background processing");
    assert.equal(processCalls, 0);

    await scheduledWork();
    assert.equal(processCalls, 1);
  });
});

function createFakeClient(responder: (request: Request) => Response | Promise<Response>) {
  const fetchStub: typeof fetch = async (input, init) => responder(new Request(input, init));
  return createClient<Database>("http://supabase.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
