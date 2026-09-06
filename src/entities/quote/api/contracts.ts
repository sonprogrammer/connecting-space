import type { Database, Json } from "@/shared/types/database.generated";

export type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
export type QuoteVersionRow = Database["public"]["Tables"]["quote_versions"]["Row"];
export type QuoteApprovalTokenRow = Database["public"]["Tables"]["quote_approval_tokens"]["Row"];
export type QuoteApprovalRow = Database["public"]["Tables"]["quote_approvals"]["Row"];

export type CreatedQuote = {
  quoteId: string;
  quoteVersionId: string;
  versionNumber: number;
  status: Database["public"]["Enums"]["quote_status"];
};

export type AdminQuoteDetail = {
  quote: QuoteRow;
  versions: QuoteVersionRow[];
  tokens: Array<Omit<QuoteApprovalTokenRow, "token_hash">>;
  approvals: QuoteApprovalRow[];
};

export type PublicQuoteSnapshot = {
  quoteId: string;
  quoteVersionId: string;
  versionNumber: number;
  customerName: string;
  title: string;
  body: string;
  scopeItems: Json;
  totalAmount: number;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  depositAmount: number;
  balanceAmount: number;
  depositTerms: string;
  balanceTerms: string;
  expiresAt: string;
};
