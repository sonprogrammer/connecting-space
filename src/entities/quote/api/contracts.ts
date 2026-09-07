import type { Database, Json } from "@/shared/types/database.generated";

export type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
export type QuoteVersionRow = Database["public"]["Tables"]["quote_versions"]["Row"];
export type QuoteApprovalTokenRow = Database["public"]["Tables"]["quote_approval_tokens"]["Row"];
export type QuoteApprovalRow = Database["public"]["Tables"]["quote_approvals"]["Row"];
export type QuoteEmailDeliveryRow = Database["public"]["Tables"]["quote_email_deliveries"]["Row"];
export type QuoteExpirationAlertRow = Database["public"]["Tables"]["quote_expiration_alerts"]["Row"];

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
  emailDeliveries: Array<Pick<QuoteEmailDeliveryRow,
    "id" | "quote_id" | "quote_version_id" | "approval_token_id" | "generation" | "status"
    | "attempt_count" | "max_attempts" | "available_at" | "sent_at" | "error_code"
    | "superseded_at" | "created_at">>;
  expirationAlerts: Array<Pick<QuoteExpirationAlertRow, "approval_token_id" | "status">>;
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
