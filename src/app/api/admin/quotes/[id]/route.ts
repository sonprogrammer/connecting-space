import type { NextRequest } from "next/server";

import { quoteIdSchema, type AdminQuoteDetail } from "@/entities/quote";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const id = quoteIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return jsonError("INVALID_QUOTE_ID", "Invalid quote id", 400);
  }

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) {
    return verified.response;
  }

  const quoteResult = await verified.supabase
    .from("quotes")
    .select("*")
    .eq("id", id.data)
    .maybeSingle();
  if (quoteResult.error) {
    return jsonError("ADMIN_QUOTE_READ_FAILED", "Failed to read quote", 500);
  }
  if (!quoteResult.data) {
    return jsonError("QUOTE_NOT_FOUND", "Quote not found", 404);
  }

  const versionsResult = await verified.supabase
    .from("quote_versions")
    .select("*")
    .eq("quote_id", id.data)
    .order("version_number", { ascending: false });
  if (versionsResult.error) {
    return jsonError("ADMIN_QUOTE_READ_FAILED", "Failed to read quote", 500);
  }

  const versionIds = (versionsResult.data ?? []).map((version) => version.id);
  const tokensResult = versionIds.length
    ? await verified.supabase
        .from("quote_approval_tokens")
        .select(
          "id,quote_version_id,expires_at,revoked_at,used_at,replaced_by_id,created_by,created_at",
        )
        .in("quote_version_id", versionIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (tokensResult.error) {
    return jsonError("ADMIN_QUOTE_READ_FAILED", "Failed to read quote", 500);
  }

  const approvalsResult = await verified.supabase
    .from("quote_approvals")
    .select("*")
    .eq("quote_id", id.data)
    .order("approved_at", { ascending: false });
  if (approvalsResult.error) {
    return jsonError("ADMIN_QUOTE_READ_FAILED", "Failed to read quote", 500);
  }

  const deliveriesResult = versionIds.length
    ? await verified.supabase.from("quote_email_deliveries")
        .select("id,quote_id,quote_version_id,approval_token_id,generation,status,attempt_count,max_attempts,available_at,sent_at,error_code,superseded_at,created_at")
        .in("quote_version_id", versionIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (deliveriesResult.error) return jsonError("ADMIN_QUOTE_READ_FAILED", "Failed to read quote", 500);

  const tokenIds = (tokensResult.data ?? []).map((token) => token.id);
  const alertsResult = tokenIds.length
    ? await verified.supabase.from("quote_expiration_alerts")
        .select("approval_token_id,status").in("approval_token_id", tokenIds)
    : { data: [], error: null };
  if (alertsResult.error) return jsonError("ADMIN_QUOTE_READ_FAILED", "Failed to read quote", 500);

  return jsonOk<AdminQuoteDetail>({
    quote: quoteResult.data,
    versions: versionsResult.data ?? [],
    tokens: tokensResult.data ?? [],
    approvals: approvalsResult.data ?? [],
    emailDeliveries: deliveriesResult.data ?? [],
    expirationAlerts: alertsResult.data ?? [],
  });
}
