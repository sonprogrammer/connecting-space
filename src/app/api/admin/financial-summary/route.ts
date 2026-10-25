import type { NextRequest } from "next/server";
import { financialSummaryQuerySchema, financialSummarySchema } from "@/entities/payment/api/financial-summary";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export async function GET(request: NextRequest) {
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;

  const search = request.nextUrl.searchParams;
  const keys = [...search.keys()];
  const parsed = financialSummaryQuerySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success || keys.length !== new Set(keys).size) {
    return jsonError("VALIDATION_ERROR", "Invalid financial summary query", 400);
  }
  const { data, error } = await admin.supabase.rpc("get_admin_financial_summary", { p_status: parsed.data.status });
  const result = financialSummarySchema.safeParse(data);
  if (error || !result.success) {
    return jsonError("ADMIN_FINANCIAL_SUMMARY_READ_FAILED", "Failed to read financial summary", 500);
  }
  return jsonOk(result.data, { headers: { "Cache-Control": "private, no-store" } });
}
