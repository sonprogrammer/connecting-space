import type { NextRequest } from "next/server";

import { quoteVersionIdSchema } from "@/entities/quote";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import { createApprovalToken } from "@/entities/quote/server/token";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const id = quoteVersionIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return jsonError("INVALID_QUOTE_VERSION_ID", "Invalid quote version id", 400);
  }

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) {
    return verified.response;
  }

  const generated = createApprovalToken();
  const { data, error } = await verified.supabase.rpc(
    "issue_quote_approval_token",
    { p_quote_version_id: id.data, p_token_hash: generated.tokenHash },
  );
  const issued = data?.[0];
  if (error || !issued) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  return jsonOk(
    { token: generated.token, expiresAt: issued.issued_expires_at },
    { status: 201 },
  );
}

export async function DELETE(request: NextRequest, context: Context) {
  const id = quoteVersionIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return jsonError("INVALID_QUOTE_VERSION_ID", "Invalid quote version id", 400);
  }

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) {
    return verified.response;
  }

  const { data, error } = await verified.supabase.rpc(
    "revoke_quote_approval_token",
    { p_quote_version_id: id.data },
  );
  const revoked = data?.[0];
  if (error || !revoked) {
    const mapped = mapQuoteRpcError(error);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }

  return jsonOk({ revoked: revoked.was_revoked });
}
