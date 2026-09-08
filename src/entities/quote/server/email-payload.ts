import type { Json } from "@/shared/types/database.generated";
import type { QuoteEmailPayload } from "./email-content";

export function createQuoteEmailPayload(input: {
  recipient: string; customerName: string; token: string;
  version: {
    title: string; body: string; scope_items: Json; total_amount: number;
    estimated_start_date: string | null; estimated_end_date: string | null;
    deposit_amount: number; balance_amount: number; deposit_terms: string; balance_terms: string;
  };
}): Omit<QuoteEmailPayload, "expiresAt"> {
  if (!Array.isArray(input.version.scope_items)
    || input.version.scope_items.some((item) => typeof item !== "string")) {
    throw new Error("INVALID_QUOTE_EMAIL_PAYLOAD");
  }
  return {
    recipient: input.recipient, customerName: input.customerName, token: input.token,
    title: input.version.title, body: input.version.body,
    scopeItems: input.version.scope_items as string[], totalAmount: input.version.total_amount,
    estimatedStartDate: input.version.estimated_start_date, estimatedEndDate: input.version.estimated_end_date,
    depositAmount: input.version.deposit_amount, balanceAmount: input.version.balance_amount,
    depositTerms: input.version.deposit_terms, balanceTerms: input.version.balance_terms,
  };
}
