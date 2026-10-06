export type InquiryQuoteApproval = {
  quoteVersionId: string | null;
  approverName: string | null;
  consentVersion: string | null;
  approvedAt: string | null;
};

export type InquiryQuoteSummary = {
  id: string;
  inquiryId: string;
  status: string;
  approvedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  approval: InquiryQuoteApproval | null;
};

export function getInquiryQuotesQueryKey(inquiryId: string) {
  return ["admin", "inquiry-quotes", inquiryId] as const;
}

export function sortInquiryQuotes<T extends Pick<InquiryQuoteSummary, "createdAt" | "updatedAt">>(quotes: T[]): T[] {
  return [...quotes].sort((left, right) => {
    const rightDate = Date.parse(right.updatedAt || right.createdAt);
    const leftDate = Date.parse(left.updatedAt || left.createdAt);
    return rightDate - leftDate;
  });
}

const statusLabels: Record<string, string> = {
  draft: "작성 중",
  sent: "발송됨",
  approved: "승인됨",
  expired: "만료됨",
  cancelled: "취소됨",
};

export function getInquiryQuoteStatusLabel(status: string) {
  return statusLabels[status] ?? "상태 확인 필요";
}

export function getInquiryQuoteApprovalLabel(approval: InquiryQuoteApproval | null) {
  return approval?.approvedAt ? "승인 완료" : "승인 전";
}

export function formatApprovalDate(value: string | null) {
  if (!value) return "승인 전";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "승인 시각 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
