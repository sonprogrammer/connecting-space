import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type Processor = typeof import("../src/shared/lib/automation/processor");
type Job = Database["public"]["Tables"]["automation_jobs"]["Row"];

const inquiryId = "11111111-1111-4111-8111-111111111111";
const draftId = "22222222-2222-4222-8222-222222222222";
const recordId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const now = "2026-08-26T00:00:00.000Z";

const job: Job = {
  id: jobId,
  inquiry_id: inquiryId,
  job_type: "generate_inquiry_reply",
  status: "processing",
  payload: {},
  attempt_count: 1,
  max_attempts: 3,
  available_at: now,
  locked_at: now,
  locked_by: "test-worker",
  last_error: null,
  completed_at: null,
  created_at: now,
  updated_at: now,
};

let processor: Processor;
const previousEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
  SLACK_INQUIRY_WEBHOOK_URL: process.env.SLACK_INQUIRY_WEBHOOK_URL,
  ADMIN_BASE_URL: process.env.ADMIN_BASE_URL,
  AUTOMATION_PROCESS_SECRET: process.env.AUTOMATION_PROCESS_SECRET,
};

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  processor = require("../src/shared/lib/automation/processor") as Processor;
});

after(() => {
  for (const [name, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("automation job processor", () => {
  test("stores an AI draft and completes generation without Slack configuration", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "test-ai-key";
    process.env.AI_MODEL = "test-model";
    delete process.env.SLACK_INQUIRY_WEBHOOK_URL;
    delete process.env.ADMIN_BASE_URL;
    delete process.env.AUTOMATION_PROCESS_SECRET;

    const fake = createProcessorSupabase();
    const result = await processor.processAutomationJob(job, {
      client: fake.client,
      now: () => new Date(now),
      fetch: async (input) => {
        assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
        return new Response(JSON.stringify({
          model: "test-model",
          choices: [{ message: { content: JSON.stringify({
            summary: "요약",
            draft: "저장된 답변 초안",
            needsConfirmation: [],
          }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }));
      },
    });

    assert.deepEqual(result, { id: jobId, status: "completed" });
    assert.equal(fake.hasDraftStatus("ready"), true);
    assert.equal(fake.enqueuedSlackJob(), true);
    assert.equal(fake.completedGenerationJob(), true);
    assert.equal(fake.hasDraftStatus("failed"), false);
  });

  test("stores a generating draft before missing AI configuration enters retry", async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    const fake = createProcessorSupabase();

    const result = await processor.processAutomationJob(job, {
      client: fake.client,
      now: () => new Date(now),
      fetch: async () => {
        throw new Error("AI request must not run without configuration");
      },
    });

    assert.equal(result.status, "retry");
    assert.equal(fake.hasDraftStatus("generating"), true);
    assert.equal(fake.hasDraftStatus("failed"), false);
  });

  test("keeps the ready AI draft when missing Slack configuration retries delivery", async () => {
    delete process.env.SLACK_INQUIRY_WEBHOOK_URL;
    delete process.env.ADMIN_BASE_URL;
    const slackJob: Job = {
      ...job,
      id: "66666666-6666-4666-8666-666666666666",
      job_type: "send_slack_notification",
    };
    const fake = createSlackFailureSupabase();

    const result = await processor.processAutomationJob(slackJob, {
      client: fake.client,
      now: () => new Date(now),
    });

    assert.equal(result.status, "retry");
    assert.equal(fake.deliveryHasStatus("retry"), true);
    assert.equal(fake.jobHasStatus("retry"), true);
    assert.equal(fake.wroteDraft(), false);
  });

  test("moves a pending Slack delivery to sent and completes its job", async () => {
    process.env.SLACK_INQUIRY_WEBHOOK_URL = "https://hooks.slack.test/example";
    process.env.ADMIN_BASE_URL = "https://admin.example.com";
    const slackJob: Job = {
      ...job,
      id: "77777777-7777-4777-8777-777777777777",
      job_type: "send_slack_notification",
    };
    const fake = createSlackFailureSupabase();

    const result = await processor.processAutomationJob(slackJob, {
      client: fake.client,
      now: () => new Date(now),
      fetch: async (input) => {
        assert.equal(String(input), "https://hooks.slack.test/example");
        return new Response("ok", { status: 200 });
      },
    });

    assert.deepEqual(result, { id: slackJob.id, status: "completed" });
    assert.equal(fake.deliveryHasStatus("sent"), true);
    assert.equal(fake.jobHasStatus("completed"), true);
  });

  test("claims only the requested job id for manual processing", async () => {
    const fake = createDirectClaimSupabase();
    const results = await processor.processAutomationJobs({
      jobId,
      dependencies: { client: fake.client },
    });

    assert.deepEqual(results, []);
    assert.equal(fake.requestedRpc("claim_automation_job_by_id"), true);
    assert.equal(fake.requestedRpc("claim_automation_jobs"), false);
    assert.equal(fake.claimedJobId(), jobId);
  });
});

function createDirectClaimSupabase() {
  const requests: Array<{ request: Request; body: string }> = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.clone().text();
    requests.push({ request: request.clone(), body });
    const resource = new URL(request.url).pathname.split("/").at(-1);
    if (request.method === "POST" && ["claim_automation_job_by_id", "claim_automation_jobs"].includes(resource ?? "")) {
      return jsonResponse([]);
    }
    throw new Error(`Unexpected database request: ${request.method} ${request.url}`);
  };
  const client = createClient<Database>("http://supabase.test", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
  return {
    client: client as SupabaseClient<Database>,
    requestedRpc: (name: string) => requests.some(({ request }) =>
      new URL(request.url).pathname.endsWith(`/${name}`)),
    claimedJobId: () => {
      const claim = requests.find(({ request }) =>
        new URL(request.url).pathname.endsWith("/claim_automation_job_by_id"));
      return claim ? (JSON.parse(claim.body) as { p_job_id?: string }).p_job_id : undefined;
    },
  };
}

function createProcessorSupabase() {
  const requests: Array<{ request: Request; body: string }> = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({ request: request.clone(), body: await request.clone().text() });
    const url = new URL(request.url);
    const resource = url.pathname.split("/").at(-1);

    if (request.method === "GET" && resource === "inquiries") {
      return jsonResponse([{
        id: inquiryId,
        customer_name: "김고객",
        company_name: null,
        website_url: null,
        service_type: "landing",
        budget_min: null,
        budget_max: null,
        desired_launch_date: null,
        message: "랜딩 페이지 제작 문의입니다.",
      }]);
    }
    if (request.method === "GET" && ["service_offerings", "faq_items"].includes(resource ?? "")) {
      return jsonResponse([]);
    }
    if (request.method === "POST" && resource === "ai_generation_records") {
      return jsonResponse([{ id: recordId }], 201);
    }
    if (request.method === "POST" && resource === "inquiry_reply_drafts") {
      const body = await request.clone().json() as { status?: string };
      return body.status === "ready" ? jsonResponse([{ id: draftId }], 201) : emptyResponse(201);
    }
    if (request.method === "POST" && resource === "enqueue_automation_job") {
      return jsonResponse("55555555-5555-4555-8555-555555555555");
    }
    if (request.method === "PATCH" && ["notification_deliveries", "automation_jobs"].includes(resource ?? "")) {
      return emptyResponse(204);
    }
    throw new Error(`Unexpected database request: ${request.method} ${url.pathname}`);
  };
  const client = createClient<Database>("http://supabase.test", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
  return {
    client: client as SupabaseClient<Database>,
    hasDraftStatus: (status: string) => requests.some(({ request, body }) =>
      request.method === "POST"
      && new URL(request.url).pathname.endsWith("/inquiry_reply_drafts")
      && body.includes(`\"status\":\"${status}\"`)),
    enqueuedSlackJob: () => requests.some(({ request, body }) =>
      new URL(request.url).pathname.endsWith("/enqueue_automation_job")
      && body.includes("send_slack_notification")),
    completedGenerationJob: () => requests.some(({ request, body }) =>
      request.method === "PATCH"
      && new URL(request.url).pathname.endsWith("/automation_jobs")
      && body.includes(`\"status\":\"completed\"`)),
  };
}

function createSlackFailureSupabase() {
  const requests: Array<{ request: Request; body: string }> = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.clone().text();
    requests.push({ request: request.clone(), body });
    const resource = new URL(request.url).pathname.split("/").at(-1);

    if (request.method === "GET" && resource === "inquiries") {
      return jsonResponse([{
        id: inquiryId,
        customer_name: "김고객",
        service_type: "landing",
        budget_min: null,
        budget_max: null,
        desired_launch_date: null,
      }]);
    }
    if (request.method === "GET" && resource === "inquiry_reply_drafts") {
      return jsonResponse([{
        id: draftId,
        inquiry_id: inquiryId,
        summary: "요약",
        draft_text: "이미 저장된 초안",
        needs_confirmation: [],
        status: "ready",
      }]);
    }
    if (request.method === "GET" && resource === "notification_deliveries") {
      return jsonResponse([]);
    }
    if (request.method === "POST" && resource === "notification_deliveries") {
      return jsonResponse([{ id: "77777777-7777-4777-8777-777777777777", status: "processing" }], 201);
    }
    if (request.method === "PATCH" && ["automation_jobs", "notification_deliveries"].includes(resource ?? "")) {
      return emptyResponse(204);
    }
    throw new Error(`Unexpected database request: ${request.method} ${request.url}`);
  };
  const client = createClient<Database>("http://supabase.test", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
  return {
    client: client as SupabaseClient<Database>,
    deliveryHasStatus: (status: string) => requests.some(({ request, body }) =>
      request.method === "PATCH"
      && new URL(request.url).pathname.endsWith("/notification_deliveries")
      && body.includes(`\"status\":\"${status}\"`)),
    jobHasStatus: (status: string) => requests.some(({ request, body }) =>
      request.method === "PATCH"
      && new URL(request.url).pathname.endsWith("/automation_jobs")
      && body.includes(`\"status\":\"${status}\"`)),
    wroteDraft: () => requests.some(({ request }) =>
      request.method !== "GET" && new URL(request.url).pathname.endsWith("/inquiry_reply_drafts")),
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status: number) {
  return new Response(null, { status });
}
