import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { confirmQuoteContractSchema, quoteVersionIdSchema } from "@/entities/quote";
import { calculateContractPayments } from "@/entities/quote/server/contract-conversion";
import { mapQuoteRpcError } from "@/entities/quote/server/rpc-errors";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const verified = await getVerifiedAdminSupabase(request);
  if (!verified.ok) return verified.response;
  const id = quoteVersionIdSchema.safeParse((await context.params).id);
  if (!id.success) return jsonError("INVALID_QUOTE_VERSION_ID", "Invalid quote version id", 400);
  const payload = confirmQuoteContractSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return jsonError("VALIDATION_ERROR", "Invalid contract confirmation payload", 400, payload.error.flatten());

  const input = payload.data;
  const { data: version, error: versionError } = await verified.supabase
    .from("quote_versions")
    .select("id,quote_id,title,total_amount,estimated_end_date,quotes!inner(inquiry_id)")
    .eq("id", id.data)
    .maybeSingle();
  if (versionError) return jsonError("QUOTE_CONTRACT_READ_FAILED", "Failed to read quote", 500);
  if (!version) return jsonError("QUOTE_VERSION_NOT_FOUND", "Quote version not found", 404);

  const payments = (() => {
    try {
      return calculateContractPayments({
        totalAmount: version.total_amount,
        confirmedDate: input.confirmedAt.slice(0, 10),
        estimatedEndDate: version.estimated_end_date,
        depositPercentage: input.depositPercentage,
        balancePercentage: input.balancePercentage,
        depositAmount: input.depositAmount,
        balanceAmount: input.balanceAmount,
        depositDueDate: input.depositDueDate,
        balanceDueDate: input.balanceDueDate,
      });
    } catch {
      return null;
    }
  })();
  if (!payments) return jsonError("PAYMENT_OVERRIDE_INVALID", "Invalid payment override", 400);

  const idempotencyKeyHash = createHash("sha256").update(input.idempotencyKey, "utf8").digest("hex");
  const { data, error } = await verified.supabase.rpc("confirm_quote_contract", {
    p_confirmation_id: randomUUID(),
    p_quote_version_id: id.data,
    p_idempotency_key_hash: idempotencyKeyHash,
    p_confirmed_at: input.confirmedAt,
    p_customer_name: input.customerName ?? null,
    p_customer_memo: input.customerMemo ?? null,
    p_project_name: input.projectName ?? version.title,
    p_project_memo: input.projectMemo ?? null,
    p_deposit_percentage: input.depositPercentage ?? 30,
    p_balance_percentage: input.balancePercentage ?? 70,
    p_deposit_amount: payments.depositAmount,
    p_balance_amount: payments.balanceAmount,
    p_deposit_due_date: payments.depositDueDate,
    p_balance_due_date: payments.balanceDueDate,
  });
  if (error) {
    const mapped = mapQuoteRpcError(error);
    if (error.code === "P0001" && error.message.includes("approved")) return jsonError("QUOTE_NOT_APPROVED", "Quote must be approved", 409);
    if (error.code === "P0001" && error.message.includes("delivery")) return jsonError("CONTRACT_NOT_CONFIRMED", "Signed contract delivery is not confirmed", 409);
    if (error.code === "P0001" && error.message.includes("already confirmed")) return jsonError("QUOTE_CONTRACT_ALREADY_CONFIRMED", "Quote contract is already confirmed", 409);
    return jsonError(mapped.code, mapped.message, mapped.status);
  }
  const row = data?.[0];
  const confirmation = row?.confirmation as Record<string, string> | undefined;
  if (!row || !confirmation) return jsonError("QUOTE_CONTRACT_CONFIRM_FAILED", "Failed to confirm quote contract", 500);
  return jsonOk({
    quoteId: confirmation.quote_id,
    quoteVersionId: confirmation.quote_version_id,
    confirmationId: confirmation.id,
    customerId: confirmation.customer_id,
    projectId: confirmation.project_id,
    depositPaymentId: confirmation.deposit_payment_id,
    balancePaymentId: confirmation.balance_payment_id,
    status: "approved" as const,
    reused: row.result === "existing",
  }, { status: row.result === "created" ? 201 : 200 });
}
