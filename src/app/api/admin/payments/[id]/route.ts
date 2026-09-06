import type { NextRequest } from "next/server";

import { paymentIdSchema, updatePaymentSchema } from "@/entities/payment";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Database } from "@/shared/types/database.generated";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PAYMENT_ID", "Invalid payment id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;
  const parsed = updatePaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid payment payload", 400, parsed.error.flatten());
  const input = parsed.data;
  const update: Database["public"]["Tables"]["payments"]["Update"] = {
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(input.dueDate !== undefined ? { due_date: input.dueDate || null } : {}),
    ...(input.paidAt !== undefined ? { paid_at: input.paidAt || null } : {}),
    ...(input.memo !== undefined ? { memo: input.memo || null } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.supabase.from("payments").update(update).eq("id", id.data).select("*").maybeSingle();
  if (error) return jsonError("ADMIN_PAYMENT_UPDATE_FAILED", "Failed to update payment", 500);
  if (!data) return jsonError("ADMIN_PAYMENT_NOT_FOUND", "Payment not found", 404);
  return jsonOk(data);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PAYMENT_ID", "Invalid payment id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;
  const { data, error } = await admin.supabase.from("payments").delete().eq("id", id.data).select("id").maybeSingle();
  if (error) return jsonError("ADMIN_PAYMENT_DELETE_FAILED", "Failed to delete payment", 500);
  if (!data) return jsonError("ADMIN_PAYMENT_NOT_FOUND", "Payment not found", 404);
  return jsonOk(data);
}
