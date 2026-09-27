export type PublicQuoteErrorState = "expired" | "unavailable" | "error";

export function normalizeScopeItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function formatQuoteAmount(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

export function formatQuoteDate(value: string | null): string {
  if (!value) return "일정 협의";
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return "일정 협의";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function getPublicQuoteErrorState(status: number): PublicQuoteErrorState {
  if (status === 410) return "expired";
  if (status === 404 || status === 409) return "unavailable";
  return "error";
}

export function validateApprovalForm(input: { customerName: string; consent: boolean }): {
  customerName?: string;
  consent?: string;
} {
  const errors: { customerName?: string; consent?: string } = {};
  if (!input.customerName.trim()) errors.customerName = "고객명을 입력해 주세요.";
  if (!input.consent) errors.consent = "견적 내용 확인 및 승인에 동의해 주세요.";
  return errors;
}
