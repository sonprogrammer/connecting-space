import { z } from "zod";
import type { NextRequest } from "next/server";

import { quoteVersionIdSchema } from "@/entities/quote";
import { loadQuoteEmailJobResponse, mapQuoteEmailJob } from "@/entities/quote/server/email-contracts";
import { createQuoteEmailPayload } from "@/entities/quote/server/email-payload";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import { createApprovalToken } from "@/entities/quote/server/token";
import { jsonError, jsonOk } from "@/shared/api/response";
import { assertQuoteEmailEnv } from "@/shared/config/env";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import { encryptQuoteEmailPayload } from "@/shared/lib/email/encrypted-payload";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = quoteVersionIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_QUOTE_VERSION_ID", "Invalid quote version id", 400);
  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) return verified.response;

  let env: ReturnType<typeof assertQuoteEmailEnv>;
  try { env = assertQuoteEmailEnv(); }
  catch { return jsonError("QUOTE_EMAIL_NOT_CONFIGURED", "Quote email is not configured", 503); }

  const { data: version, error: versionError } = await verified.supabase
    .from("quote_versions")
    .select("id,quote_id,title,body,scope_items,total_amount,estimated_start_date,estimated_end_date,deposit_amount,balance_amount,deposit_terms,balance_terms,quotes!inner(id,inquiry_id,status,latest_version_id)")
    .eq("id", id.data).maybeSingle();
  if (versionError) return jsonError("QUOTE_EMAIL_READ_FAILED", "Failed to prepare quote email", 500);
  if (!version) return jsonError("QUOTE_VERSION_NOT_FOUND", "Quote version not found", 404);

  const quote = version.quotes as unknown as { id: string; inquiry_id: string; status: string; latest_version_id: string | null };
  const { data: inquiry, error: inquiryError } = await verified.supabase
    .from("inquiries").select("customer_name,email").eq("id", quote.inquiry_id).maybeSingle();
  if (inquiryError || !inquiry) return jsonError("QUOTE_EMAIL_READ_FAILED", "Failed to prepare quote email", 500);
  const email = z.email().safeParse(inquiry.email);
  if (!email.success) return jsonError("QUOTE_RECIPIENT_EMAIL_REQUIRED", "A valid recipient email is required", 400);

  const jobId = crypto.randomUUID();
  const approvalTokenId = crypto.randomUUID();
  const generated = createApprovalToken();
  let payload;
  try {
    payload = createQuoteEmailPayload({ recipient: email.data, customerName: inquiry.customer_name, token: generated.token, version });
  } catch {
    return jsonError("QUOTE_EMAIL_PAYLOAD_INVALID", "Quote email payload is invalid", 409);
  }
  const encrypted = encryptQuoteEmailPayload(payload, { jobId, quoteVersionId: id.data, approvalTokenId }, env.encryptionKey);
  const { data, error } = await verified.supabase.rpc("enqueue_quote_email_delivery", {
    p_job_id: jobId, p_quote_version_id: id.data, p_token_id: approvalTokenId,
    p_token_hash: generated.tokenHash, p_encrypted_payload: encrypted.ciphertext,
    p_payload_nonce: encrypted.nonce, p_payload_auth_tag: encrypted.authTag,
  });
  if (error) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }
  if (!data?.[0]?.delivery) return jsonError("QUOTE_EMAIL_ENQUEUE_FAILED", "Failed to enqueue quote email", 500);
  const result = data[0];
  if (result.result === "retry_required") {
    return jsonError("QUOTE_EMAIL_RETRY_REQUIRED", "The failed email job must be retried", 409, mapQuoteEmailJob(result.delivery));
  }
  const response = await loadQuoteEmailJobResponse(verified.supabase, result.delivery)
    .catch(() => null);
  if (!response) return jsonError("QUOTE_EMAIL_STATUS_READ_FAILED", "Failed to read quote email status", 500);
  return jsonOk(response, { status: result.result === "created" ? 202 : 200 });
}
