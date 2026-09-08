export function buildQuoteExpirationSlackMessage(input: {
  quoteId: string;
  versionNumber: number;
  expiresAt: string;
  adminBaseUrl: string;
}) {
  const origin = new URL(input.adminBaseUrl).origin;
  const detailUrl = `${origin}/admin/quotes/${input.quoteId}`;
  const expires = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short",
  }).format(new Date(input.expiresAt));
  return { blocks: [
    { type: "header", text: { type: "plain_text", text: "견적 승인 링크 만료 예정" } },
    { type: "section", text: { type: "mrkdwn", text: `*버전 ${input.versionNumber}* · ${expires}\n<${detailUrl}|관리자 견적 상세 보기>` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "고객에게 자동 재촉 메일은 발송되지 않습니다." }] },
  ] };
}

export async function sendQuoteExpirationSlack(
  input: Parameters<typeof buildQuoteExpirationSlackMessage>[0],
  options: { webhookUrl: string; fetch?: typeof fetch },
) {
  const response = await (options.fetch ?? fetch)(options.webhookUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildQuoteExpirationSlackMessage(input)),
  });
  if (!response.ok) throw new Error("QUOTE_EXPIRATION_SLACK_FAILED");
}
