import type { NextRequest } from "next/server";

import {
  calculateProjectPaymentSummary,
  createPaymentSchema,
  paymentIdSchema,
  type AdminProjectPaymentsResponse,
  type PaymentReceiptRow,
  type PaymentRow,
} from "@/entities/payment";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PROJECT_ID", "Invalid project id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;

  const project = await admin.supabase.from("projects").select("id,contract_amount").eq("id", id.data).maybeSingle();
  if (project.error) return jsonError("ADMIN_PROJECT_PAYMENTS_READ_FAILED", "Failed to read project payments", 500);
  if (!project.data) return jsonError("ADMIN_PROJECT_NOT_FOUND", "Project not found", 404);

  const paymentsResult = await admin.supabase.from("payments").select("*").eq("project_id", id.data).order("due_date", { ascending: true }).order("created_at", { ascending: true });
  if (paymentsResult.error) return jsonError("ADMIN_PROJECT_PAYMENTS_READ_FAILED", "Failed to read project payments", 500);
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  let receipts: PaymentReceiptRow[] = [];
  if (payments.length > 0) {
    const receiptResult = await admin.supabase.from("payment_receipts").select("*").in("payment_id", payments.map((payment) => payment.id)).order("received_at", { ascending: true });
    if (receiptResult.error) return jsonError("ADMIN_PROJECT_PAYMENTS_READ_FAILED", "Failed to read project payments", 500);
    receipts = (receiptResult.data ?? []) as PaymentReceiptRow[];
  }

  const calculated = calculateProjectPaymentSummary(project.data.contract_amount, payments, receipts);
  const balances = new Map(calculated.payments.map((balance) => [balance.paymentId, balance]));
  return jsonOk<AdminProjectPaymentsResponse>({
    payments: payments.map((payment) => ({ ...payment, ...balances.get(payment.id)! })),
    receipts,
    summary: {
      expectedRevenue: calculated.expectedRevenue,
      confirmedRevenue: calculated.confirmedRevenue,
      receivedTotal: calculated.receivedTotal,
      outstanding: calculated.outstanding,
    },
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const id = paymentIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_PROJECT_ID", "Invalid project id", 400, id.error.flatten());
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return admin.response;
  const parsed = createPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid payment payload", 400, parsed.error.flatten());

  const { data, error } = await admin.supabase.from("payments").insert({
    project_id: id.data,
    kind: parsed.data.kind,
    amount: parsed.data.amount,
    due_date: parsed.data.dueDate || null,
    memo: parsed.data.memo || null,
  }).select("*").single();
  if (error?.code === "23503") return jsonError("ADMIN_PROJECT_NOT_FOUND", "Project not found", 404);
  if (error) return jsonError("ADMIN_PAYMENT_CREATE_FAILED", "Failed to create payment", 500);
  return jsonOk(data, { status: 201 });
}
