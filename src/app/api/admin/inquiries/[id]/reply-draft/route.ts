import type { NextRequest } from "next/server";
import { z } from "zod";
import { updateReplyDraftSchema } from "@/entities/automation/schemas/content.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Json } from "@/shared/types/database.generated";

type Context = { params: Promise<{ id: string }> };
async function getId(context: Context) { return z.string().uuid().safeParse((await context.params).id); }
export async function GET(request: NextRequest, context: Context) {
  const id = await getId(context); if (!id.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const [{ data: draft, error }, { data: deliveries, error: deliveryError }] = await Promise.all([
    admin.supabase.from("inquiry_reply_drafts").select("*").eq("inquiry_id", id.data).maybeSingle(),
    admin.supabase.from("notification_deliveries").select("*").eq("inquiry_id", id.data).order("created_at", { ascending: false }).limit(1),
  ]);
  if (error || deliveryError) return jsonError("REPLY_DRAFT_READ_FAILED", "Failed to read reply draft", 500);
  if (!draft) return jsonError("REPLY_DRAFT_NOT_FOUND", "Reply draft not found", 404);
  return jsonOk({ id: draft.id, inquiryId: draft.inquiry_id, generationRecordId: draft.generation_record_id,
    summary: draft.summary, draft: draft.draft_text, needsConfirmation: draft.needs_confirmation,
    status: draft.status, lastError: draft.last_error, updatedAt: draft.updated_at, slackDelivery: deliveries?.[0] ?? null });
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
