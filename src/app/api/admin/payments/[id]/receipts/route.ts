import type { NextRequest } from "next/server";

import { createPaymentReceiptSchema, paymentIdSchema } from "@/entities/payment";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PAYMENT_ID", "Invalid payment id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;
  const parsed = createPaymentReceiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid receipt payload", 400, parsed.error.flatten());
  const input = parsed.data;
  const receipt = {
    payment_id: id.data,
    amount: input.amount,
    received_at: input.receivedAt ?? new Date().toISOString(),
    idempotency_key: input.idempotencyKey,
    memo: input.memo || null,
  };
  const { data, error } = await admin.supabase.from("payment_receipts").insert(receipt).select("*").single();
  if (!error) return jsonOk(data, { status: 201 });
  if (error.code === "23503") return jsonError("ADMIN_PAYMENT_NOT_FOUND", "Payment not found", 404);
  if (error.code !== "23505") return jsonError("ADMIN_PAYMENT_RECEIPT_CREATE_FAILED", "Failed to create payment receipt", 500);

  const existing = await admin.supabase.from("payment_receipts").select("*").eq("payment_id", id.data).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error || !existing.data) return jsonError("ADMIN_PAYMENT_RECEIPT_CREATE_FAILED", "Failed to read existing payment receipt", 500);
  if (existing.data.amount !== input.amount) {
    return jsonError(
      "PAYMENT_RECEIPT_IDEMPOTENCY_CONFLICT",
      "Idempotency key was already used with a different receipt amount",
      409,
    );
  }
  return jsonOk(existing.data);
}
