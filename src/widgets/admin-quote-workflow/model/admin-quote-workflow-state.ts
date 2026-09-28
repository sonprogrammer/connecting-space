import type { QuoteSnapshotInput } from "@/entities/quote";

export type QuoteDraftForm = {
  title: string;
  body: string;
  scopeItems: string[];
  totalAmount: string;
  estimatedStartDate: string;
  estimatedEndDate: string;
  depositAmount: string;
  balanceAmount: string;
  depositTerms: string;
  balanceTerms: string;
};

export type QuoteDraftErrors = Partial<Record<keyof QuoteDraftForm, string>>;

export function calculateQuoteSplit(totalAmount: number, depositPercentage: number) {
  const depositAmount = Math.floor((totalAmount * depositPercentage) / 100);
  return { depositAmount, balanceAmount: totalAmount - depositAmount };
}

export function validateQuoteDraft(form: QuoteDraftForm): QuoteDraftErrors {
  const errors: QuoteDraftErrors = {};
  if (!form.title.trim()) errors.title = "견적 제목을 입력해 주세요.";
  if (!form.body.trim()) errors.body = "견적 내용을 입력해 주세요.";
  if (form.scopeItems.filter((item) => item.trim()).length === 0) errors.scopeItems = "작업 범위를 한 가지 이상 입력해 주세요.";

  const total = parseMoney(form.totalAmount);
  const deposit = parseMoney(form.depositAmount);
  const balance = parseMoney(form.balanceAmount);
  if (total === undefined || total <= 0) errors.totalAmount = "총액은 1원 이상의 정수로 입력해 주세요.";
  if (deposit === undefined || deposit < 0) errors.depositAmount = "계약금을 확인해 주세요.";
  if (balance === undefined || balance < 0) errors.balanceAmount = "잔금을 확인해 주세요.";
  if (total !== undefined && deposit !== undefined && balance !== undefined && deposit + balance !== total) {
    errors.balanceAmount = "계약금과 잔금의 합계가 총액과 같아야 합니다.";
  }
  if (!form.depositTerms.trim()) errors.depositTerms = "계약금 조건을 입력해 주세요.";
  if (!form.balanceTerms.trim()) errors.balanceTerms = "잔금 조건을 입력해 주세요.";
  if (form.estimatedStartDate && form.estimatedEndDate && form.estimatedEndDate < form.estimatedStartDate) {
    errors.estimatedEndDate = "종료일은 시작일보다 빠를 수 없습니다.";
  }
  return errors;
}

export function toQuoteSnapshotPayload(form: QuoteDraftForm): QuoteSnapshotInput {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    scopeItems: form.scopeItems.map((item) => item.trim()).filter(Boolean),
    totalAmount: parseMoney(form.totalAmount) ?? 0,
    estimatedStartDate: form.estimatedStartDate || null,
    estimatedEndDate: form.estimatedEndDate || null,
    depositAmount: parseMoney(form.depositAmount) ?? 0,
    balanceAmount: parseMoney(form.balanceAmount) ?? 0,
    depositTerms: form.depositTerms.trim(),
    balanceTerms: form.balanceTerms.trim(),
  };
}

function parseMoney(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

const quoteStatusLabels: Record<string, string> = {
  draft: "작성 중",
  sent: "발송됨",
  approved: "승인됨",
  expired: "만료됨",
  cancelled: "취소됨",
  completed: "종료됨",
};

const deliveryLabels: Record<string, string> = {
  queued: "발송 대기",
  processing: "발송 중",
  sent: "발송 완료",
  retry: "재시도 대기",
  failed: "발송 실패",
  discarded: "폐기됨",
};

export function getQuoteStatusLabel(status: string): string {
  return quoteStatusLabels[status] ?? "상태 확인 필요";
}

export function getQuoteDeliveryLabel(status: string): string {
  return deliveryLabels[status] ?? "상태 확인 필요";
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function completeContractConfirmation<T>(request: () => Promise<T>, onSuccess: () => void): Promise<T> {
  const result = await request();
  onSuccess();
  return result;
}
