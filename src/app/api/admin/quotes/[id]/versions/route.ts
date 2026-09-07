import type { NextRequest } from "next/server";

import { quoteIdSchema, quoteSnapshotSchema } from "@/entities/quote";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import {
  toCreatedQuote,
  toQuoteSnapshotRpcArgs,
} from "@/entities/quote/server/rpc-payload";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const id = quoteIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return jsonError("INVALID_QUOTE_ID", "Invalid quote id", 400);
  }

  const body = await request.json().catch(() => null);
  const parsed = quoteSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid quote payload",
      400,
      parsed.error.flatten(),
    );
  }

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) {
    return verified.response;
  }

  const { data, error } = await verified.supabase.rpc("create_quote_version", {
    p_quote_id: id.data,
    ...toQuoteSnapshotRpcArgs(parsed.data),
  });
  const created = data?.[0];
  if (error || !created) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  return jsonOk(toCreatedQuote(created), { status: 201 });
}
