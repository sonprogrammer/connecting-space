import type {
  AdminQuoteDetail,
  ConfirmQuoteContractInput,
  ConfirmQuoteContractResponse,
  CreateQuoteInput,
  CreatedQuote,
  ManualQuoteDeliveryInput,
  QuoteSnapshotInput,
} from "@/entities/quote";
import type { AdminInquiryDetail, AdminInquiryListItem } from "@/entities/inquiry";
import type { ApiResponse } from "@/shared/types/api";

export class AdminQuoteRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "AdminQuoteRequestError";
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (response.status === 401 || response.status === 403) {
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new AdminQuoteRequestError(response.status, "ADMIN_AUTH_REQUIRED", "관리자 인증이 만료되었습니다.");
  }
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!response.ok || !result || "error" in result) {
    const error = result && "error" in result ? result.error : undefined;
    throw new AdminQuoteRequestError(response.status, error?.code ?? "REQUEST_FAILED", error?.message ?? "요청을 처리하지 못했습니다.");
  }
  return result.data;
}

export const adminQuoteKeys = {
  inquiries: ["admin", "inquiries"] as const,
  inquiry: (id: string) => ["admin", "inquiry", id] as const,
  quote: (id: string) => ["admin", "quote", id] as const,
};

export function fetchAdminInquiries(): Promise<AdminInquiryListItem[]> {
  return requestJson("/api/admin/inquiries");
}

export function fetchAdminInquiry(id: string): Promise<AdminInquiryDetail> {
  return requestJson(`/api/admin/inquiries/${encodeURIComponent(id)}`);
}

export function createAdminInquiry(input: Record<string, unknown>): Promise<{ id: string; status: string }> {
  return requestJson("/api/admin/inquiries", { method: "POST", body: JSON.stringify(input) });
}

export function fetchAdminQuote(id: string): Promise<AdminQuoteDetail> {
  return requestJson(`/api/admin/quotes/${encodeURIComponent(id)}`);
}

export function createQuote(input: CreateQuoteInput): Promise<CreatedQuote> {
  return requestJson("/api/admin/quotes", { method: "POST", body: JSON.stringify(input) });
}

export function createQuoteVersion(quoteId: string, input: QuoteSnapshotInput): Promise<CreatedQuote> {
  return requestJson(`/api/admin/quotes/${encodeURIComponent(quoteId)}/versions`, { method: "POST", body: JSON.stringify(input) });
}

export type QuoteEmailJobResponse = {
  jobId: string;
  quoteId: string;
  quoteVersionId: string;
  approvalTokenId: string;
  generation: number;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  errorCode: string | null;
  expirationAlertStatus: string | null;
};

export function sendQuoteEmail(versionId: string): Promise<QuoteEmailJobResponse> {
  return requestJson(`/api/admin/quote-versions/${encodeURIComponent(versionId)}/send`, { method: "POST" });
}

export function retryQuoteEmail(jobId: string): Promise<QuoteEmailJobResponse> {
  return requestJson(`/api/admin/quote-email-jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
}

export type ManualPdfResult = { blob: Blob; deliveryId: string; expiresAt: string };

export async function issueManualQuotePdf(versionId: string, input: ManualQuoteDeliveryInput): Promise<ManualPdfResult> {
  const response = await fetch(`/api/admin/quote-versions/${encodeURIComponent(versionId)}/manual-delivery`, {
    method: "POST",
    headers: { Accept: "application/pdf", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.status === 401 || response.status === 403) {
    window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new AdminQuoteRequestError(response.status, "ADMIN_AUTH_REQUIRED", "관리자 인증이 만료되었습니다.");
  }
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as ApiResponse<never> | null;
    const error = result && "error" in result ? result.error : undefined;
    throw new AdminQuoteRequestError(response.status, error?.code ?? "QUOTE_MANUAL_PDF_FAILED", error?.message ?? "수동 PDF를 발급하지 못했습니다.");
  }
  return {
    blob: await response.blob(),
    deliveryId: response.headers.get("X-Quote-Manual-Delivery-Id") ?? "",
    expiresAt: response.headers.get("X-Quote-Expires-At") ?? "",
  };
}

export function confirmQuoteContract(versionId: string, input: ConfirmQuoteContractInput): Promise<ConfirmQuoteContractResponse> {
  return requestJson(`/api/admin/quote-versions/${encodeURIComponent(versionId)}/confirm-contract`, { method: "POST", body: JSON.stringify(input) });
}
