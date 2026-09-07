import { isIP } from "node:net";
import type { NextRequest } from "next/server";

import { hashApprovalToken } from "@/entities/quote/server/token";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: Context) {
  const tokenHash = hashApprovalToken((await context.params).token);
  if (!tokenHash) {
    return jsonError(
      "QUOTE_APPROVAL_UNAVAILABLE",
      "Quote approval is unavailable",
      409,
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("approve_quote_by_token", {
    p_token_hash: tokenHash,
    p_client_ip: trustedClientIp(request),
    p_user_agent: sanitizeUserAgent(request.headers.get("user-agent")),
  });
  if (error) {
    return jsonError(
      "QUOTE_APPROVAL_FAILED",
      "Failed to approve quote",
      500,
    );
  }

  const result = data?.[0];
  if (result?.result === "expired") {
    return jsonError("QUOTE_LINK_EXPIRED", "Quote link has expired", 410);
  }
  if (result?.result !== "approved") {
    return jsonError(
      "QUOTE_APPROVAL_UNAVAILABLE",
      "Quote approval is unavailable",
      409,
    );
  }
  if (
    !result.approved_quote_id ||
    !result.approved_quote_version_id ||
    !result.approved_at
  ) {
    return jsonError(
      "QUOTE_APPROVAL_FAILED",
      "Failed to approve quote",
      500,
    );
  }

  return jsonOk({
    quoteId: result.approved_quote_id,
    quoteVersionId: result.approved_quote_version_id,
    approvedAt: result.approved_at,
  });
}

function trustedClientIp(request: NextRequest) {
  const first = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return first && isIP(first) ? first : null;
}

function sanitizeUserAgent(value: string | null) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized ? normalized.slice(0, 500) : null;
}
