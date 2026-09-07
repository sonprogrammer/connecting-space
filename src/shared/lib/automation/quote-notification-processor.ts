import type { SupabaseClient } from "@supabase/supabase-js";

import type { QuoteEmailPayload } from "@/entities/quote/server/email-content";
import { buildQuoteApprovalEmail } from "@/entities/quote/server/email-content";
import { sendQuoteExpirationSlack } from "@/entities/quote/server/expiration-slack";
import { assertQuoteEmailEnv, assertSlackEnv } from "@/shared/config/env";
import type { Database } from "@/shared/types/database.generated";
import { decryptQuoteEmailPayload } from "@/shared/lib/email/encrypted-payload";
import { sendTransactionalEmail } from "@/shared/lib/email/resend";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";

type Client = SupabaseClient<Database>;
type Delivery = Database["public"]["Tables"]["quote_email_deliveries"]["Row"];
type Config = ReturnType<typeof assertQuoteEmailEnv>;

function expiresAt(dispatchStartedAt: string) {
  return new Date(new Date(dispatchStartedAt).getTime() + 7 * 24 * 60 * 60_000).toISOString();
}

function safeEmailError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return [
    "QUOTE_EMAIL_TOKEN_UNAVAILABLE", "INVALID_QUOTE_EMAIL_ENCRYPTION_KEY",
    "RESEND_RETRYABLE", "RESEND_REJECTED", "RESEND_INVALID_RESPONSE", "QUOTE_EMAIL_FINALIZE_FAILED",
  ].includes(code) ? code : "QUOTE_EMAIL_PROCESSING_FAILED";
}

export async function processQuoteEmailDelivery(
  job: Delivery,
  dependencies: { client: Client; config?: Config; fetch?: typeof fetch },
) {
  const client = dependencies.client;
  try {
    const [{ data: token, error: tokenError }, { data: quote, error: quoteError }] = await Promise.all([
      client.from("quote_approval_tokens").select("id,revoked_at,used_at,expires_at").eq("id", job.approval_token_id).maybeSingle(),
      client.from("quotes").select("id,status,latest_version_id").eq("id", job.quote_id).maybeSingle(),
    ]);
    const now = job.dispatch_started_at ?? new Date().toISOString();
    if (tokenError || quoteError || !token || !quote || token.revoked_at || token.used_at
      || (token.expires_at && token.expires_at <= now)
      || quote.latest_version_id !== job.quote_version_id || ["approved", "cancelled"].includes(quote.status)) {
      throw new Error("QUOTE_EMAIL_TOKEN_UNAVAILABLE");
    }
    const config = dependencies.config ?? assertQuoteEmailEnv();
    const payload = decryptQuoteEmailPayload<Omit<QuoteEmailPayload, "expiresAt">>({
      ciphertext: job.encrypted_payload, nonce: job.payload_nonce, authTag: job.payload_auth_tag,
    }, { jobId: job.id, quoteVersionId: job.quote_version_id, approvalTokenId: job.approval_token_id }, config.encryptionKey);
    const message = buildQuoteApprovalEmail({ ...payload, expiresAt: expiresAt(now) }, config.publicBaseUrl);
    const provider = await sendTransactionalEmail({ ...message, from: config.fromEmail }, {
      apiKey: config.apiKey, idempotencyKey: `quote-approval/${job.id}`, fetch: dependencies.fetch,
    });
    const { error } = await client.rpc("finalize_quote_email_delivery", {
      p_job_id: job.id, p_provider_message_id: provider.id, p_sent_at: now,
    });
    if (error) throw new Error("QUOTE_EMAIL_FINALIZE_FAILED");
    return { id: job.id, status: "sent" as const };
  } catch (error) {
    const errorCode = safeEmailError(error);
    await client.rpc("fail_quote_email_delivery", { p_job_id: job.id, p_error_code: errorCode });
    return {
      id: job.id,
      status: job.attempt_count >= job.max_attempts ? "failed" as const : "retry" as const,
      error: errorCode,
    };
  }
}

async function processExpirationAlert(
  alert: Database["public"]["Tables"]["quote_expiration_alerts"]["Row"],
  dependencies: { client: Client; fetch?: typeof fetch },
) {
  try {
    const [{ data: version }, { data: token }] = await Promise.all([
      dependencies.client.from("quote_versions").select("version_number").eq("id", alert.quote_version_id).maybeSingle(),
      dependencies.client.from("quote_approval_tokens").select("expires_at").eq("id", alert.approval_token_id).maybeSingle(),
    ]);
    if (!version || !token?.expires_at) throw new Error("QUOTE_EXPIRATION_UNAVAILABLE");
    const slack = assertSlackEnv();
    await sendQuoteExpirationSlack({ quoteId: alert.quote_id, versionNumber: version.version_number, expiresAt: token.expires_at, adminBaseUrl: slack.adminBaseUrl }, { webhookUrl: slack.slackWebhookUrl, fetch: dependencies.fetch });
    const { error } = await dependencies.client.rpc("finalize_quote_expiration_alert", { p_alert_id: alert.id });
    if (error) throw new Error("QUOTE_EXPIRATION_FINALIZE_FAILED");
    return { id: alert.id, status: "sent" as const };
  } catch {
    await dependencies.client.rpc("fail_quote_expiration_alert", { p_alert_id: alert.id, p_error_code: "QUOTE_EXPIRATION_SLACK_FAILED" });
    return { id: alert.id, status: alert.attempt_count >= alert.max_attempts ? "failed" as const : "retry" as const };
  }
}

export async function processQuoteNotifications(options: {
  client?: Client; fetch?: typeof fetch; limit?: number; workerId?: string; config?: Config;
} = {}) {
  const config = options.config ?? assertQuoteEmailEnv();
  const client = options.client ?? createSupabaseAdminClient();
  const workerId = options.workerId ?? `quote-${crypto.randomUUID()}`;
  await client.rpc("schedule_quote_lifecycle", {});
  const [{ data: deliveries, error: deliveryError }, { data: alerts, error: alertError }] = await Promise.all([
    client.rpc("claim_quote_email_deliveries", { p_worker_id: workerId, p_limit: options.limit ?? 5 }),
    client.rpc("claim_quote_expiration_alerts", { p_worker_id: workerId, p_limit: options.limit ?? 5 }),
  ]);
  if (deliveryError || alertError) throw new Error("Failed to claim quote notification jobs");
  const emailResults = await Promise.all((deliveries ?? []).map((job) => processQuoteEmailDelivery(job, { client, config, fetch: options.fetch })));
  const alertResults = await Promise.all((alerts ?? []).map((alert) => processExpirationAlert(alert, { client, fetch: options.fetch })));
  return [...emailResults, ...alertResults];
}
