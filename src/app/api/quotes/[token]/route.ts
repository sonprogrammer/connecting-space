import type { NextRequest } from "next/server";

import type { PublicQuoteSnapshot } from "@/entities/quote";
import { hashApprovalToken } from "@/entities/quote/server/token";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const tokenHash = hashApprovalToken((await context.params).token);
  if (!tokenHash) {
    return unavailableResponse();
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_quote_by_token", {
    p_token_hash: tokenHash,
  });
  if (error) {
    return jsonError(
      "PUBLIC_QUOTE_READ_FAILED",
      "Failed to read public quote",
      500,
    );
  }

  const row = data?.[0];
  if (row?.availability === "expired") {
    return jsonError("QUOTE_LINK_EXPIRED", "Quote link has expired", 410);
  }
  if (
    row?.availability !== "available" ||
    !row.quote_id ||
    !row.quote_version_id ||
    row.version_number === null ||
    !row.customer_name ||
    !row.title ||
    !row.body ||
    row.scope_items === null ||
    row.total_amount === null ||
    row.deposit_amount === null ||
    row.balance_amount === null ||
    !row.deposit_terms ||
    !row.balance_terms ||
    !row.expires_at
  ) {
    return unavailableResponse();
  }

  return jsonOk<PublicQuoteSnapshot>({
    quoteId: row.quote_id,
    quoteVersionId: row.quote_version_id,
    versionNumber: row.version_number,
    customerName: row.customer_name,
    title: row.title,
    body: row.body,
    scopeItems: row.scope_items,
    totalAmount: row.total_amount,
    estimatedStartDate: row.estimated_start_date,
    estimatedEndDate: row.estimated_end_date,
    depositAmount: row.deposit_amount,
    balanceAmount: row.balance_amount,
    depositTerms: row.deposit_terms,
    balanceTerms: row.balance_terms,
    expiresAt: row.expires_at,
  });
}

function unavailableResponse() {
  return jsonError(
    "QUOTE_LINK_UNAVAILABLE",
    "Quote link is unavailable",
    404,
  );
}
