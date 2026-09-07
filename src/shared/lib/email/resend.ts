export type TransactionalEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendTransactionalEmail(
  message: TransactionalEmail,
  options: { apiKey: string; idempotencyKey: string; fetch?: typeof fetch },
) {
  const response = await (options.fetch ?? fetch)("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": options.idempotencyKey,
    },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(response.status === 429 || response.status >= 500
      ? "RESEND_RETRYABLE"
      : "RESEND_REJECTED");
  }
  const body = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string" || !body.id) {
    throw new Error("RESEND_INVALID_RESPONSE");
  }
  return { id: body.id };
}
