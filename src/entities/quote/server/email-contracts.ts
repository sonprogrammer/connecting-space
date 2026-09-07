import type { Database } from "@/shared/types/database.generated";

export type QuoteEmailDeliveryRow = Database["public"]["Tables"]["quote_email_deliveries"]["Row"];

export function mapQuoteEmailJob(
  row: Pick<QuoteEmailDeliveryRow, "id" | "quote_id" | "quote_version_id" | "approval_token_id" | "generation" | "status" | "attempt_count" | "max_attempts" | "available_at" | "sent_at" | "error_code">,
  expiresAt: string | null = null,
  expirationAlertStatus: Database["public"]["Enums"]["quote_delivery_status"] | null = null,
) {
  return {
    jobId: row.id,
    quoteId: row.quote_id,
    quoteVersionId: row.quote_version_id,
    approvalTokenId: row.approval_token_id,
    generation: row.generation,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.status === "queued" || row.status === "retry" ? row.available_at : null,
    sentAt: row.sent_at,
    expiresAt,
    errorCode: row.error_code,
    expirationAlertStatus,
  };
}
