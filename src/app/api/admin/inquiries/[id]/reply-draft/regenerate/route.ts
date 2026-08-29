import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";
import { processAutomationJobs } from "@/shared/lib/automation/processor";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  const id = z.string().uuid().safeParse((await context.params).id); if (!id.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400);
  const admin = await getVerifiedAdminSupabase(request); if (!admin.ok) return admin.response;
  const { data: inquiry, error } = await admin.supabase.from("inquiries").select("id").eq("id", id.data).maybeSingle();
  if (error) return jsonError("INQUIRY_READ_FAILED", "Failed to read inquiry", 500);
  if (!inquiry) return jsonError("INQUIRY_NOT_FOUND", "Inquiry not found", 404);
  const service = createSupabaseAdminClient();
  const { data: job, error: requeueError } = await service.rpc("requeue_automation_job", { p_inquiry_id: id.data, p_job_type: "generate_inquiry_reply", p_payload: { manual: true } });
  if (requeueError || !job) return jsonError("REPLY_REGENERATION_FAILED", "Failed to enqueue reply regeneration", 500);
  await service.from("inquiry_reply_drafts").upsert({ inquiry_id: id.data, status: "generating", last_error: null }, { onConflict: "inquiry_id" });
  after(async () => {
    await processAutomationJobs({ jobId: job.id }).catch(() => undefined);
  });
  return jsonOk({ jobId: job.id, status: job.status }, { status: 202 });
}
