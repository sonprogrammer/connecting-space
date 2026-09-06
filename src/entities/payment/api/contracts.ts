import type { Database } from "@/shared/types/database.generated";
import type { PaymentBalance, ProjectPaymentSummary } from "../model/types";

export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentReceiptRow = Database["public"]["Tables"]["payment_receipts"]["Row"];

export type AdminProjectPaymentsResponse = {
  payments: Array<PaymentRow & PaymentBalance>;
  receipts: PaymentReceiptRow[];
  summary: Omit<ProjectPaymentSummary, "payments">;
};
