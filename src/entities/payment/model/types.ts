export type PaymentKind = "deposit" | "balance" | "extra";
export type PaymentStatus = "expected" | "paid" | "overdue" | "cancelled";

export type PaymentSummaryInput = {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
};

export type PaymentReceiptSummaryInput = {
  payment_id: string;
  amount: number;
};

export type PaymentBalance = {
  paymentId: string;
  receivedAmount: number;
  outstandingAmount: number;
};

export type ProjectPaymentSummary = {
  expectedRevenue: number;
  confirmedRevenue: number;
  receivedTotal: number;
  outstanding: number;
  payments: PaymentBalance[];
};
