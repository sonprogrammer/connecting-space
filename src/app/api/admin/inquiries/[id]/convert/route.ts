import type { NextRequest } from "next/server";

import { convertInquirySchema, type ConvertInquiryResponse, inquiryIdSchema } from "@/entities/inquiry";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const parsedId = inquiryIdSchema.safeParse(id);
  if (!parsedId.success) return jsonError("INVALID_INQUIRY_ID", "Invalid inquiry id", 400, parsedId.error.flatten());

  const payload = convertInquirySchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return jsonError("VALIDATION_ERROR", "Invalid inquiry conversion payload", 400, payload.error.flatten());

  const input = payload.data;
  const { data, error } = await admin.supabase.rpc("convert_inquiry_to_project", {
    p_inquiry_id: parsedId.data,
    p_customer_name: input.customerName,
    p_customer_memo: input.customerMemo || null,
    p_project_name: input.projectName,
    p_contract_amount: input.contractAmount,
    p_expected_launch_date: input.expectedLaunchDate || null,
    p_project_memo: input.projectMemo || null,
  });

  if (error) {
    if (error.code === "P0002") return jsonError("INQUIRY_NOT_FOUND", "Inquiry not found", 404);
    if (error.code === "42501") return jsonError("ADMIN_AUTH_REQUIRED", "Admin access required", 403);
    return jsonError("INQUIRY_CONVERSION_FAILED", "Failed to convert inquiry", 500);
  }
  const result = data?.[0] as ConvertInquiryResponse | undefined;
  if (!result) return jsonError("INQUIRY_CONVERSION_FAILED", "Failed to convert inquiry", 500);
  return jsonOk(result, { status: 200 });
}
