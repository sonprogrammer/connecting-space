import type {
  AdminProjectPaymentsResponse,
  CreatePaymentInput,
  CreatePaymentReceiptInput,
  PaymentReceiptRow,
  PaymentRow,
  UpdatePaymentInput,
} from "@/entities/payment";
import type { ApiResponse } from "@/shared/types/api";
import { AdminQueryError, parseAdminQueryResponse } from "./admin-customer-project-queries";

export const adminProjectPaymentQueryKeys = {
  all: ["admin", "project-payments"] as const,
  detail: (projectId: string) => [...adminProjectPaymentQueryKeys.all, projectId] as const,
};

async function fetchPayment<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  return parseAdminQueryResponse<T>(response);
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function fetchProjectPayments(projectId: string) {
  return fetchPayment<AdminProjectPaymentsResponse>(`/api/admin/projects/${projectId}/payments`);
}

export function createPayment(projectId: string, input: CreatePaymentInput) {
  return fetchPayment<PaymentRow>(`/api/admin/projects/${projectId}/payments`, jsonBody(input));
}

export function updatePayment(paymentId: string, input: UpdatePaymentInput) {
  return fetchPayment<PaymentRow>(`/api/admin/payments/${paymentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deletePayment(paymentId: string) {
  return fetchPayment<{ id: string }>(`/api/admin/payments/${paymentId}`, { method: "DELETE" });
}

export function createPaymentReceipt(
  paymentId: string,
  input: Omit<CreatePaymentReceiptInput, "idempotencyKey"> & { idempotencyKey?: string },
) {
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  return fetchPayment<PaymentReceiptRow>(
    `/api/admin/payments/${paymentId}/receipts`,
    jsonBody({ ...input, idempotencyKey }),
  );
}

export function deletePaymentReceipt(receiptId: string) {
  return fetchPayment<{ id: string }>(`/api/admin/payment-receipts/${receiptId}`, { method: "DELETE" });
}

export function paymentErrorMessage(error: unknown) {
  if (error instanceof AdminQueryError) return error.message;
  return "결제 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export type PaymentMutationResult = ApiResponse<PaymentRow | PaymentReceiptRow | { id: string }>;
