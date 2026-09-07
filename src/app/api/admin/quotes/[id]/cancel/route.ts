import type { NextRequest } from "next/server";

import { quoteIdSchema } from "@/entities/quote";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const id = quoteIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return jsonError("INVALID_QUOTE_ID", "Invalid quote id", 400);
  }

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) {
    return verified.response;
  }

  const { data, error } = await verified.supabase.rpc("cancel_quote", {
    p_quote_id: id.data,
  });
  const cancelled = data?.[0];
  if (error || !cancelled) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  return jsonOk({
    quoteId: cancelled.cancelled_quote_id,
    status: cancelled.cancelled_status,
  });
}
