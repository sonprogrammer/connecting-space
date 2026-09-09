import type { NextRequest } from "next/server";

import { manualQuoteDeliverySchema, quoteVersionIdSchema } from "@/entities/quote";
import {
  createManualQuotePdfPayload,
  renderManualQuotePdf,
} from "@/entities/quote/server/manual-pdf";
import { assertQuoteManualDeliveryEnv } from "@/entities/quote/server/manual-env";
import { deriveManualApprovalToken } from "@/entities/quote/server/manual-token";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import { jsonError } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const id = quoteVersionIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return jsonError("INVALID_QUOTE_VERSION_ID", "Invalid quote version id", 400);
  }

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) return verified.response;

  const body = manualQuoteDeliverySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonError("INVALID_MANUAL_DELIVERY_INPUT", "Invalid manual delivery input", 400);
  }

  let env: ReturnType<typeof assertQuoteManualDeliveryEnv>;
  try {
    env = assertQuoteManualDeliveryEnv();
  } catch {
    return jsonError(
      "QUOTE_MANUAL_DELIVERY_NOT_CONFIGURED",
      "Quote manual delivery is not configured",
      503,
    );
  }

  const { data: version, error: versionError } = await verified.supabase
    .from("quote_versions")
    .select("id,quote_id,title,body,scope_items,total_amount,estimated_start_date,estimated_end_date,deposit_amount,balance_amount,deposit_terms,balance_terms,quotes!inner(id,inquiry_id,status,latest_version_id)")
    .eq("id", id.data)
    .maybeSingle();
  if (versionError) {
    return jsonError("QUOTE_MANUAL_DELIVERY_READ_FAILED", "Failed to prepare quote PDF", 500);
  }
  if (!version) {
    return jsonError("QUOTE_VERSION_NOT_FOUND", "Quote version not found", 404);
  }

  const quote = version.quotes as unknown as {
    id: string;
    inquiry_id: string;
    status: string;
    latest_version_id: string | null;
  };
  const { data: inquiry, error: inquiryError } = await verified.supabase
    .from("inquiries")
    .select("customer_name")
    .eq("id", quote.inquiry_id)
    .maybeSingle();
  if (inquiryError || !inquiry) {
    return jsonError("QUOTE_MANUAL_DELIVERY_READ_FAILED", "Failed to prepare quote PDF", 500);
  }

  const generated = deriveManualApprovalToken({
    key: env.tokenKey,
    quoteVersionId: id.data,
    idempotencyKey: body.data.idempotencyKey,
  });
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(issuedAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
  const basePayload = {
    customerName: inquiry.customer_name,
    token: generated.token,
    publicBaseUrl: env.publicBaseUrl,
    issuedAt,
    expiresAt,
    version,
  };

  let pdf: Uint8Array;
  try {
    pdf = await renderManualQuotePdf(createManualQuotePdfPayload(basePayload));
  } catch {
    return jsonError("QUOTE_MANUAL_PDF_FAILED", "Failed to create quote PDF", 500);
  }

  const { data, error } = await verified.supabase.rpc("issue_quote_manual_delivery", {
    p_delivery_id: crypto.randomUUID(),
    p_quote_version_id: id.data,
    p_token_id: crypto.randomUUID(),
    p_token_hash: generated.tokenHash,
    p_idempotency_key_hash: generated.idempotencyKeyHash,
    p_reissue: body.data.reissue,
    p_issued_at: issuedAt,
  });
  if (error) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }
  const result = data?.[0];
  if (!result?.delivery || !["created", "existing"].includes(result.result)) {
    return jsonError("QUOTE_MANUAL_DELIVERY_FAILED", "Failed to issue quote PDF", 500);
  }

  if (
    result.delivery.issued_at !== issuedAt ||
    result.delivery.expires_at !== expiresAt
  ) {
    try {
      pdf = await renderManualQuotePdf(createManualQuotePdfPayload({
        ...basePayload,
        issuedAt: result.delivery.issued_at,
        expiresAt: result.delivery.expires_at,
      }));
    } catch {
      return jsonError("QUOTE_MANUAL_PDF_FAILED", "Failed to create quote PDF", 500);
    }
  }

  return new Response(Buffer.from(pdf), {
    status: result.result === "created" ? 201 : 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="quote-${id.data}.pdf"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
      "X-Quote-Expires-At": result.delivery.expires_at,
      "X-Quote-Manual-Delivery-Id": result.delivery.id,
    },
  });
}
