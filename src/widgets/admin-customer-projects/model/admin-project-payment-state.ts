import type {
  CreatePaymentInput,
  PaymentKind,
  PaymentRow,
  PaymentStatus,
} from "@/entities/payment";

export const paymentKindLabels: Record<PaymentKind, string> = {
  deposit: "계약금",
  balance: "잔금",
  extra: "추가 비용",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  expected: "예정",
  paid: "입금 완료",
  overdue: "미수",
  cancelled: "취소",
};

export type PaymentDisplayStatus = PaymentStatus | "partial";

export const paymentDisplayStatusLabels: Record<PaymentDisplayStatus, string> = {
  ...paymentStatusLabels,
  partial: "부분 입금",
};

export type PaymentFormState = {
  kind: PaymentKind;
  amount: string;
  dueDate: string;
  memo: string;
};

export type ReceiptFormState = {
  amount: string;
  receivedAt: string;
  memo: string;
  idempotencyKey: string;
};

export const emptyPaymentForm = (): PaymentFormState => ({
  kind: "deposit",
  amount: "",
  dueDate: "",
  memo: "",
});

export const emptyReceiptForm = (): ReceiptFormState => ({
  amount: "",
  receivedAt: new Date().toISOString().slice(0, 10),
  memo: "",
  idempotencyKey: crypto.randomUUID(),
});

export function getPaymentDisplayStatus(payment: Pick<PaymentRow, "status" | "amount"> & { receivedAmount: number; outstandingAmount: number }): PaymentDisplayStatus {
  if (payment.status === "cancelled") return "cancelled";
  if (payment.receivedAmount > 0 && payment.outstandingAmount > 0) return "partial";
  if (payment.outstandingAmount <= 0 && payment.receivedAmount >= payment.amount) return "paid";
  return payment.status;
}

export function parsePositiveInteger(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

export function amountErrorMessage(value: string) {
  if (value.trim() === "") return "금액을 입력해 주세요.";
  if (parsePositiveInteger(value) === undefined) return "금액은 1원 이상의 정수로 입력해 주세요.";
  return undefined;
}

export function toCreatePaymentInput(form: PaymentFormState): CreatePaymentInput | undefined {
  const amount = parsePositiveInteger(form.amount);
  if (amount === undefined) return undefined;
  return {
    kind: form.kind,
    amount,
    ...(form.dueDate ? { dueDate: form.dueDate } : {}),
    ...(form.memo.trim() ? { memo: form.memo.trim() } : {}),
  };
}

export function formatPaymentAmount(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function formatPaymentDate(value: string | null | undefined) {
  if (!value) return "미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}
