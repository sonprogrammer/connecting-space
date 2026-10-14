import type { InquiryReplyDraft } from "@/entities/automation";
import type { ApiResponse } from "@/shared/types/api";

export const adminReplyDraftQueryKeys = {
  all: ["admin", "reply-drafts"] as const,
  detail: (inquiryId: string) => [...adminReplyDraftQueryKeys.all, inquiryId] as const,
};

export class ReplyDraftQueryError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export async function fetchAdminReplyDraft(inquiryId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}/reply-draft`, { cache: "no-store", headers: { Accept: "application/json" }, signal });
  const result = await response.json() as ApiResponse<InquiryReplyDraft>;
  if (!response.ok || "error" in result) throw new ReplyDraftQueryError("error" in result ? result.error.message : "AI 초안을 불러오지 못했습니다.", response.status, "error" in result ? result.error.code : undefined);
  return result.data;
}
