import type { ApiResponse } from "@/shared/types/api";
import { redirectToAdminLogin } from "../../../shared/lib/auth/admin-login-redirect";
import {
  getInquiryQuotesQueryKey,
  sortInquiryQuotes,
  type InquiryQuoteSummary,
} from "./admin-inquiry-quotes-state";

export class AdminInquiryQuotesError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "AdminInquiryQuotesError";
  }
}

export { getInquiryQuotesQueryKey };

export async function fetchInquiryQuotes(inquiryId: string): Promise<{ quotes: InquiryQuoteSummary[] }> {
  const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}/quotes`, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    if (typeof window !== "undefined") redirectToAdminLogin();
    throw new AdminInquiryQuotesError(response.status, "ADMIN_AUTH_REQUIRED", "관리자 인증이 만료되었습니다.");
  }
  const result = (await response.json().catch(() => null)) as ApiResponse<{ quotes: InquiryQuoteSummary[] }> | null;
  if (!response.ok || !result || "error" in result) {
    const error = result && "error" in result ? result.error : undefined;
    throw new AdminInquiryQuotesError(response.status, error?.code ?? "ADMIN_INQUIRY_QUOTES_READ_FAILED", error?.message ?? "문의 견적을 불러오지 못했습니다.");
  }
  return { quotes: sortInquiryQuotes(result.data.quotes) };
}
