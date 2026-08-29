import assert from "node:assert/strict";
import { after, before, beforeEach, describe, mock, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type RegenerateRoute = typeof import("../src/app/api/admin/inquiries/[id]/reply-draft/regenerate/route");
type Job = Database["public"]["Tables"]["automation_jobs"]["Row"];

const inquiryId = "11111111-1111-4111-8111-111111111111";
const jobId = "22222222-2222-4222-8222-222222222222";

let route: RegenerateRoute;
let scheduledWork: (() => Promise<void>) | undefined;
let processOptions: Array<Record<string, unknown>> = [];
let serviceRequests: Request[] = [];
let jobs: Job[] = [];
let serviceClient: SupabaseClient<Database>;

const now = "2026-08-26T00:00:00.000Z";
const future = "2026-08-26T01:00:00.000Z";
const otherJobId = "33333333-3333-4333-8333-333333333333";

before(() => {
  registerPathAlias();
  const adminClient = createFakeClient((request) => {
    assert.equal(request.method, "GET");
    return jsonResponse([{ id: inquiryId }]);
  });
  serviceClient = createFakeClient(async (request) => {
    serviceRequests.push(request.clone());
    const resource = new URL(request.url).pathname.split("/").at(-1);
    if (resource === "enqueue_automation_job") return jsonResponse(jobId);
    if (resource === "requeue_automation_job") {
      const body = await request.json() as { p_inquiry_id: string };
      const target = jobs.find((job) => job.inquiry_id === body.p_inquiry_id);
      assert.ok(target);
      if (target.status !== "processing") {
        Object.assign(target, {
          status: "pending",
          available_at: now,
          locked_at: null,
          locked_by: null,
          last_error: null,
          updated_at: now,
        });
      }
      return jsonResponse(target);
    }
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
  mock.method(processorModule, "processAutomationJobs", async (options: Record<string, unknown>) => {
    processOptions.push(options);
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

beforeEach(() => {
  scheduledWork = undefined;
  processOptions = [];
  serviceRequests = [];
  jobs = [
    createJob({
      id: otherJobId,
      inquiry_id: "44444444-4444-4444-8444-444444444444",
      status: "pending",
      available_at: "2026-08-25T23:00:00.000Z",
      created_at: "2026-08-25T23:00:00.000Z",
    }),
    createJob({
      id: jobId,
      inquiry_id: inquiryId,
      status: "retry",
      available_at: future,
      locked_at: null,
      locked_by: null,
      last_error: "temporary AI failure",
    }),
  ];
});

describe("reply draft regeneration API", () => {
  test("atomically requeues a future retry for immediate processing", async () => {
    const response = await route.POST(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft/regenerate`, { method: "POST" }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { data: { jobId, status: "pending" } });
    assert.equal(requestedRpc("requeue_automation_job"), true);
    assert.equal(requestedRpc("enqueue_automation_job"), false);

    const target = jobs.find((job) => job.id === jobId);
    assert.equal(target?.status, "pending");
    assert.equal(target?.available_at, now);
    assert.equal(target?.last_error, null);
  });

  test("processes the returned job id instead of an older queued job", async () => {
    await route.POST(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft/regenerate`, { method: "POST" }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    assert.ok(scheduledWork, "regeneration must schedule background processing");
    assert.deepEqual(processOptions, []);

    await scheduledWork();
    assert.deepEqual(processOptions, [{ jobId }]);
    assert.equal(jobs.find((job) => job.id === otherJobId)?.status, "pending");
  });

  test("keeps an already processing job locked to its current worker", async () => {
    const target = jobs.find((job) => job.id === jobId);
    assert.ok(target);
    Object.assign(target, {
      status: "processing",
      locked_at: now,
      locked_by: "active-worker",
      last_error: null,
    });

    const response = await route.POST(
      new NextRequest(`http://localhost/api/admin/inquiries/${inquiryId}/reply-draft/regenerate`, { method: "POST" }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    assert.deepEqual(await response.json(), { data: { jobId, status: "processing" } });
    assert.equal(target.status, "processing");
    assert.equal(target.locked_at, now);
    assert.equal(target.locked_by, "active-worker");
  });
});

function requestedRpc(name: string) {
  return serviceRequests.some((request) => new URL(request.url).pathname.endsWith(`/${name}`));
}

function createJob(overrides: Partial<Job>): Job {
  return {
    id: jobId,
    inquiry_id: inquiryId,
    job_type: "generate_inquiry_reply",
    status: "pending",
    payload: {},
    attempt_count: 1,
    max_attempts: 3,
    available_at: now,
    locked_at: null,
    locked_by: null,
    last_error: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

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
