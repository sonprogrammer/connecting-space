import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  const id = z.string().uuid().safeParse((await context.params).id); if (!id.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const { data: draft, error } = await admin.supabase.from("inquiry_reply_drafts").select("id,status").eq("inquiry_id", id.data).maybeSingle();
  if (error) return jsonError("REPLY_DRAFT_READ_FAILED", "Failed to read reply draft", 500);
  if (!draft || draft.status !== "ready") return jsonError("READY_REPLY_DRAFT_REQUIRED", "A ready reply draft is required", 409);
  const service = createSupabaseAdminClient();
  const { data: jobId, error: enqueueError } = await service.rpc("enqueue_automation_job", { p_inquiry_id: id.data, p_job_type: "send_slack_notification", p_payload: { draft_id: draft.id, manual: true } });
  if (enqueueError) return jsonError("SLACK_RETRY_FAILED", "Failed to enqueue Slack retry", 500);
  await service.from("notification_deliveries").update({ status: "pending", last_error: null }).eq("draft_id", draft.id).eq("channel", "slack");
  return jsonOk({ jobId, status: "pending" }, { status: 202 });
}
