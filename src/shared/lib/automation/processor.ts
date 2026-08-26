import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAiEnv, assertSlackEnv } from "@/shared/config/env";
import type { Database, Json } from "@/shared/types/database.generated";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";
import { nextFailureState, redactAutomationError } from "./errors";
import { generateInquiryReply } from "./ai";
import { sendSlackNotification } from "./slack";

type Job = Database["public"]["Tables"]["automation_jobs"]["Row"];
type Client = SupabaseClient<Database>;
type Dependencies = { client?: Client; fetch?: typeof fetch; now?: () => Date };

function budgetLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${min.toLocaleString("ko-KR")}원 ~ ${max.toLocaleString("ko-KR")}원`;
  if (min != null) return `${min.toLocaleString("ko-KR")}원 이상`;
  if (max != null) return `${max.toLocaleString("ko-KR")}원 이하`;
  return "미정";
}

async function completeJob(client: Client, id: string, now: Date) {
  const { error } = await client.from("automation_jobs").update({ status: "completed", completed_at: now.toISOString(), locked_at: null, locked_by: null, last_error: null }).eq("id", id);
  if (error) throw new Error("Failed to complete automation job");
}

async function failJob(client: Client, job: Job, error: unknown, now: Date) {
  const safeError = redactAutomationError(error);
  const next = nextFailureState(job.attempt_count, job.max_attempts, now);
  const { error: updateError } = await client.from("automation_jobs").update({
    status: next.status, ...(next.availableAt ? { available_at: next.availableAt } : {}),
    locked_at: null, locked_by: null, last_error: safeError,
  }).eq("id", job.id);
  if (updateError) throw new Error("Failed to record automation job failure");
  if (job.job_type === "generate_inquiry_reply") {
    await client.from("ai_generation_records").insert({
      inquiry_id: job.inquiry_id, kind: "inquiry_reply", provider: process.env.AI_PROVIDER ?? "unconfigured",
      model: process.env.AI_MODEL ?? "unconfigured", prompt: "",
      error_message: safeError,
    });
  }
  if (job.job_type === "generate_inquiry_reply" && next.status === "failed") {
    await client.from("inquiry_reply_drafts").upsert({ inquiry_id: job.inquiry_id, status: "failed", last_error: safeError }, { onConflict: "inquiry_id" });
  }
  if (job.job_type === "send_slack_notification") {
    await client.from("notification_deliveries").update({ status: next.status, last_error: safeError, attempt_count: job.attempt_count }).eq("inquiry_id", job.inquiry_id).eq("channel", "slack");
  }
}

async function generateDraft(client: Client, job: Job, fetcher: typeof fetch | undefined, now: Date) {
  const [{ data: inquiry, error: inquiryError }, { data: offerings, error: offeringError }, { data: faqs, error: faqError }] = await Promise.all([
    client.from("inquiries").select("*").eq("id", job.inquiry_id).maybeSingle(),
    client.from("service_offerings").select("*").eq("is_published", true).order("sort_order"),
    client.from("faq_items").select("*").eq("is_published", true).order("sort_order"),
  ]);
  if (inquiryError || !inquiry || offeringError || faqError) throw new Error("Failed to load inquiry automation context");
  const { error: generatingError } = await client.from("inquiry_reply_drafts")
    .upsert({ inquiry_id: inquiry.id, status: "generating", last_error: null }, { onConflict: "inquiry_id" });
  if (generatingError) throw new Error("Failed to initialize inquiry reply draft");
  const ai = assertAiEnv();
  const result = await generateInquiryReply({
    inquiry: { customerName: inquiry.customer_name, companyName: inquiry.company_name, websiteUrl: inquiry.website_url,
      serviceType: inquiry.service_type, budgetMin: inquiry.budget_min, budgetMax: inquiry.budget_max,
      desiredLaunchDate: inquiry.desired_launch_date, message: inquiry.message },
    offerings: offerings ?? [], faqs: faqs ?? [],
  }, { ...ai, fetch: fetcher });
  const { data: record, error: recordError } = await client.from("ai_generation_records").insert({
    inquiry_id: inquiry.id, kind: "inquiry_reply", provider: result.provider, model: result.model,
    prompt: result.prompt, output: JSON.stringify({ summary: result.summary, draft: result.draft, needsConfirmation: result.needsConfirmation }),
    input_tokens: result.inputTokens, output_tokens: result.outputTokens,
  }).select("id").single();
  if (recordError || !record) throw new Error("Failed to persist AI generation record");
  const { data: draft, error: draftError } = await client.from("inquiry_reply_drafts").upsert({
    inquiry_id: inquiry.id, generation_record_id: record.id, summary: result.summary, draft_text: result.draft,
    needs_confirmation: result.needsConfirmation as Json, status: "ready", last_error: null,
  }, { onConflict: "inquiry_id" }).select("id").single();
  if (draftError || !draft) throw new Error("Failed to persist inquiry reply draft");
  await client.from("notification_deliveries").update({ status: "pending", attempt_count: 0, last_error: null, sent_at: null })
    .eq("draft_id", draft.id).eq("channel", "slack");
  const { error: enqueueError } = await client.rpc("enqueue_automation_job", { p_inquiry_id: inquiry.id, p_job_type: "send_slack_notification", p_payload: { draft_id: draft.id } });
  if (enqueueError) throw new Error("Failed to enqueue Slack notification");
  await completeJob(client, job.id, now);
}

async function sendSlack(client: Client, job: Job, fetcher: typeof fetch | undefined, now: Date) {
  const [{ data: inquiry, error: inquiryError }, { data: draft, error: draftError }] = await Promise.all([
    client.from("inquiries").select("*").eq("id", job.inquiry_id).maybeSingle(),
    client.from("inquiry_reply_drafts").select("*").eq("inquiry_id", job.inquiry_id).eq("status", "ready").maybeSingle(),
  ]);
  if (inquiryError || !inquiry || draftError || !draft) throw new Error("Ready draft not found for Slack notification");
  const { data: existingDelivery, error: existingError } = await client.from("notification_deliveries")
    .select("id,status").eq("draft_id", draft.id).eq("channel", "slack").maybeSingle();
  if (existingError) throw new Error("Failed to read Slack delivery state");
  if (existingDelivery?.status === "sent") { await completeJob(client, job.id, now); return; }
  const { data: delivery, error: deliveryError } = await client.from("notification_deliveries").upsert({
    inquiry_id: inquiry.id, draft_id: draft.id, channel: "slack", status: "processing", attempt_count: job.attempt_count, last_error: null,
  }, { onConflict: "draft_id,channel" }).select("id,status").single();
  if (deliveryError || !delivery) throw new Error("Failed to persist Slack delivery attempt");
  const env = assertSlackEnv();
  const confirmations = Array.isArray(draft.needs_confirmation) ? draft.needs_confirmation : [];
  await sendSlackNotification({ inquiryId: inquiry.id, customerName: inquiry.customer_name, serviceType: inquiry.service_type,
    budget: budgetLabel(inquiry.budget_min, inquiry.budget_max), desiredLaunchDate: inquiry.desired_launch_date ?? "미정",
    summary: draft.summary, draft: draft.draft_text,
    needsConfirmation: confirmations as Array<{ topic: string; reason: string; suggestedQuestion: string }>, adminBaseUrl: env.adminBaseUrl,
  }, { webhookUrl: env.slackWebhookUrl, fetch: fetcher });
  const { error: sentError } = await client.from("notification_deliveries").update({ status: "sent", sent_at: now.toISOString(), last_error: null }).eq("id", delivery.id);
  if (sentError) throw new Error("Failed to mark Slack delivery sent");
  await completeJob(client, job.id, now);
}

export async function processAutomationJob(job: Job, dependencies: Dependencies = {}) {
  const client = dependencies.client ?? createSupabaseAdminClient();
  const now = dependencies.now?.() ?? new Date();
  try {
    if (job.job_type === "generate_inquiry_reply") await generateDraft(client, job, dependencies.fetch, now);
    else await sendSlack(client, job, dependencies.fetch, now);
    return { id: job.id, status: "completed" as const };
  } catch (error) {
    await failJob(client, job, error, now);
    return { id: job.id, status: nextFailureState(job.attempt_count, job.max_attempts, now).status, error: redactAutomationError(error) };
  }
}

export async function processAutomationJobs(options: { limit?: number; workerId?: string; dependencies?: Dependencies } = {}) {
  const client = options.dependencies?.client ?? createSupabaseAdminClient();
  const workerId = options.workerId ?? `next-${crypto.randomUUID()}`;
  const { data: jobs, error } = await client.rpc("claim_automation_jobs", { p_worker_id: workerId, p_limit: Math.max(1, Math.min(options.limit ?? 5, 20)) });
  if (error) throw new Error("Failed to claim automation jobs");
  return Promise.all((jobs ?? []).map((job) => processAutomationJob(job, { ...options.dependencies, client })));
}
