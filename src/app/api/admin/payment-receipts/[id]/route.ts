import type { NextRequest } from "next/server";

import { paymentIdSchema, updatePaymentReceiptSchema } from "@/entities/payment";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PAYMENT_RECEIPT_ID", "Invalid payment receipt id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;
  const parsed = updatePaymentReceiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid receipt payload", 400, parsed.error.flatten());
  const input = parsed.data;
  const { data, error } = await admin.supabase.from("payment_receipts").update({
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.receivedAt !== undefined ? { received_at: input.receivedAt } : {}),
    ...(input.memo !== undefined ? { memo: input.memo || null } : {}),
    updated_at: new Date().toISOString(),
  }).eq("id", id.data).select("*").maybeSingle();
  if (error) return jsonError("ADMIN_PAYMENT_RECEIPT_UPDATE_FAILED", "Failed to update payment receipt", 500);
  if (!data) return jsonError("ADMIN_PAYMENT_RECEIPT_NOT_FOUND", "Payment receipt not found", 404);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PAYMENT_RECEIPT_ID", "Invalid payment receipt id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;
  const { data, error } = await admin.supabase.from("payment_receipts").delete().eq("id", id.data).select("id").maybeSingle();
  if (error) return jsonError("ADMIN_PAYMENT_RECEIPT_DELETE_FAILED", "Failed to delete payment receipt", 500);
  if (!data) return jsonError("ADMIN_PAYMENT_RECEIPT_NOT_FOUND", "Payment receipt not found", 404);
  return jsonOk(data);
}
