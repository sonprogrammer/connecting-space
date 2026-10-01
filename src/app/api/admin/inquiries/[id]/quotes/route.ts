import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const parsedId = z.uuid().safeParse((await context.params).id);
  if (!parsedId.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400);

  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) return verified.response;

  const inquiry = await verified.supabase.from("inquiries").select("id").eq("id", parsedId.data).maybeSingle();
  if (inquiry.error) return jsonError("ADMIN_INQUIRY_QUOTES_READ_FAILED", "Failed to read inquiry quotes", 500);
  if (!inquiry.data) return jsonError("ADMIN_INQUIRY_NOT_FOUND", "Inquiry not found", 404);

  const quotes = await verified.supabase
    .from("quotes")
    .select("id,inquiry_id,status,approved_version_id,created_at,updated_at")
    .eq("inquiry_id", parsedId.data)
    .order("created_at", { ascending: false });
  if (quotes.error) return jsonError("ADMIN_INQUIRY_QUOTES_READ_FAILED", "Failed to read inquiry quotes", 500);

  const quoteIds = (quotes.data ?? []).map((quote) => quote.id);
  const approvals = quoteIds.length
    ? await verified.supabase.from("quote_approvals")
      .select("quote_id,quote_version_id,approver_name,consent_version,approved_at")
      .in("quote_id", quoteIds)
      .order("approved_at", { ascending: false })
    : { data: [], error: null };
  if (approvals.error) return jsonError("ADMIN_INQUIRY_QUOTES_READ_FAILED", "Failed to read inquiry quote approvals", 500);

  const approvalByQuote = new Map<string, (typeof approvals.data)[number]>();
  for (const approval of approvals.data ?? []) if (!approvalByQuote.has(approval.quote_id)) approvalByQuote.set(approval.quote_id, approval);

  return jsonOk({ quotes: (quotes.data ?? []).map((quote) => ({
    id: quote.id,
    inquiryId: quote.inquiry_id,
    status: quote.status,
    approvedVersionId: quote.approved_version_id,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    approval: approvalByQuote.has(quote.id) ? {
      quoteVersionId: approvalByQuote.get(quote.id)?.quote_version_id ?? null,
      approverName: approvalByQuote.get(quote.id)?.approver_name ?? null,
      consentVersion: approvalByQuote.get(quote.id)?.consent_version ?? null,
      approvedAt: approvalByQuote.get(quote.id)?.approved_at ?? null,
    } : null,
  })) });
}
