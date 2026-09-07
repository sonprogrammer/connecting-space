import type { NextRequest } from "next/server";

import { createQuoteSchema } from "@/entities/quote";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import {
  toCreatedQuote,
  toQuoteSnapshotRpcArgs,
} from "@/entities/quote/server/rpc-payload";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createQuoteSchema.safeParse(body);
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

  const { inquiryId, ...snapshot } = parsed.data;
  const { data, error } = await verified.supabase.rpc(
    "create_quote_with_version",
    {
      p_inquiry_id: inquiryId,
      ...toQuoteSnapshotRpcArgs(snapshot),
    },
  );
  const created = data?.[0];
  if (error || !created) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  return jsonOk(toCreatedQuote(created), { status: 201 });
}
