import type { QuoteSnapshotInput } from "@/entities/quote/schemas/quote.schema";

export function toQuoteSnapshotRpcArgs(input: QuoteSnapshotInput) {
  return {
    p_title: input.title,
    p_body: input.body,
    p_scope_items: input.scopeItems,
    p_total_amount: input.totalAmount,
    p_estimated_start_date: input.estimatedStartDate,
    p_estimated_end_date: input.estimatedEndDate,
    p_deposit_amount: input.depositAmount,
    p_balance_amount: input.balanceAmount,
    p_deposit_terms: input.depositTerms,
    p_balance_terms: input.balanceTerms,
  };
}

export function toCreatedQuote(row: {
  created_quote_id: string;
  created_quote_version_id: string;
  created_version_number: number;
  created_status: "draft" | "sent" | "approved" | "expired" | "cancelled";
}) {
  return {
    quoteId: row.created_quote_id,
    quoteVersionId: row.created_quote_version_id,
    versionNumber: row.created_version_number,
    status: row.created_status,
  };
}
