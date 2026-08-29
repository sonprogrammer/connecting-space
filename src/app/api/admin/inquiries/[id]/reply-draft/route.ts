import type { NextRequest } from "next/server";
import { z } from "zod";
import type { AdminInquiryReplyDraftResponse } from "@/entities/automation/api/contracts";
import { updateReplyDraftSchema } from "@/entities/automation/schemas/content.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";
import type { Json } from "@/shared/types/database.generated";

type Context = { params: Promise<{ id: string }> };
async function getId(context: Context) { return z.string().uuid().safeParse((await context.params).id); }
export async function GET(request: NextRequest, context: Context) {
  const id = await getId(context); if (!id.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const service = createSupabaseAdminClient();
  const [
    { data: draft, error },
    { data: deliveries, error: deliveryError },
    { data: generationJobs, error: generationJobError },
  ] = await Promise.all([
    admin.supabase.from("inquiry_reply_drafts").select("*").eq("inquiry_id", id.data).maybeSingle(),
    admin.supabase.from("notification_deliveries").select("*").eq("inquiry_id", id.data).order("created_at", { ascending: false }).limit(1),
    service.from("automation_jobs")
      .select("id,status,attempt_count,max_attempts,available_at,last_error")
      .eq("inquiry_id", id.data).eq("job_type", "generate_inquiry_reply")
      .order("created_at", { ascending: false }).limit(1),
  ]);
  if (error || deliveryError || generationJobError) return jsonError("REPLY_DRAFT_READ_FAILED", "Failed to read reply draft", 500);
  if (!draft) return jsonError("REPLY_DRAFT_NOT_FOUND", "Reply draft not found", 404);
  const { data: generationRecord, error: generationError } = draft.generation_record_id
    ? await admin.supabase.from("ai_generation_records").select("provider,model,created_at")
      .eq("id", draft.generation_record_id).maybeSingle()
    : { data: null, error: null };
  if (generationError) return jsonError("REPLY_DRAFT_READ_FAILED", "Failed to read reply draft", 500);
  const response = { id: draft.id, inquiryId: draft.inquiry_id, generationRecordId: draft.generation_record_id,
    generationRecord: draft.generation_record_id && generationRecord ? { id: draft.generation_record_id,
      provider: generationRecord.provider, model: generationRecord.model, createdAt: generationRecord.created_at } : null,
    summary: draft.summary, draft: draft.draft_text, needsConfirmation: draft.needs_confirmation,
    status: draft.status, lastError: draft.last_error, updatedAt: draft.updated_at,
    generationJob: generationJobs?.[0] ? {
      id: generationJobs[0].id, status: generationJobs[0].status,
      attemptCount: generationJobs[0].attempt_count, maxAttempts: generationJobs[0].max_attempts,
      availableAt: ["pending", "retry"].includes(generationJobs[0].status)
        ? generationJobs[0].available_at : null,
      lastError: generationJobs[0].last_error,
    } : null,
    slackDelivery: deliveries?.[0] ?? null } satisfies AdminInquiryReplyDraftResponse;
  return jsonOk(response);
}
export async function PATCH(request: NextRequest, context: Context) {
  const id = await getId(context); if (!id.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const parsed = updateReplyDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid reply draft payload", 400, parsed.error.flatten());
  const { data, error } = await admin.supabase.from("inquiry_reply_drafts").update({
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.draft !== undefined ? { draft_text: parsed.data.draft } : {}),
    ...(parsed.data.needsConfirmation !== undefined ? { needs_confirmation: parsed.data.needsConfirmation as Json } : {}),
  }).eq("inquiry_id", id.data).select("*").maybeSingle();
  if (error) return jsonError("REPLY_DRAFT_UPDATE_FAILED", "Failed to update reply draft", 500);
  if (!data) return jsonError("REPLY_DRAFT_NOT_FOUND", "Reply draft not found", 404);
  return jsonOk({ id: data.id, updatedAt: data.updated_at });
}
