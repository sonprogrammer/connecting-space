import { z } from "zod";
import type { NextRequest } from "next/server";

import { loadQuoteEmailJobResponse } from "@/entities/quote/server/email-contracts";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_QUOTE_EMAIL_JOB_ID", "Invalid quote email job id", 400);
  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) return verified.response;
  const { data, error } = await verified.supabase.rpc("retry_quote_email_delivery", { p_job_id: id.data });
  if (error || !data?.[0]) return jsonError("QUOTE_EMAIL_RETRY_FAILED", "Failed to retry quote email", 500);
  const result = data[0];
  if (result.result === "not_found") return jsonError("QUOTE_EMAIL_JOB_NOT_FOUND", "Quote email job not found", 404);
  if (result.result === "reissue_required") return jsonError("QUOTE_EMAIL_REISSUE_REQUIRED", "A new approval link must be issued", 409);
  if (result.result === "unavailable") return jsonError("QUOTE_EMAIL_UNAVAILABLE", "Quote email is unavailable", 409);
  const response = await loadQuoteEmailJobResponse(verified.supabase, result.delivery)
    .catch(() => null);
  if (!response) return jsonError("QUOTE_EMAIL_STATUS_READ_FAILED", "Failed to read quote email status", 500);
  return jsonOk(response, { status: result.result === "requeued" ? 202 : 200 });
}
