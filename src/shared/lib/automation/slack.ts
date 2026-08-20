type SlackInput = {
  inquiryId: string; customerName: string; serviceType: string; budget: string;
  desiredLaunchDate: string; summary: string; draft: string;
  needsConfirmation: Array<{ topic: string; reason: string; suggestedQuestion: string }>;
  adminBaseUrl: string; email?: string; phone?: string; message?: string;
};

export function buildSlackMessage(input: SlackInput) {
  const confirmation = input.needsConfirmation.length
    ? input.needsConfirmation.map((item) => `• *${item.topic}*: ${item.reason}\n  ${item.suggestedQuestion}`).join("\n")
    : "없음";
  return { blocks: [
    { type: "header", text: { type: "plain_text", text: "새 제작 문의 · AI 답변 초안" } },
    { type: "section", text: { type: "mrkdwn", text: `<${input.adminBaseUrl.replace(/\/$/, "")}/admin/inquiries/${input.inquiryId}|관리자 문의 상세 보기>` } },
    { type: "section", fields: [
      { type: "mrkdwn", text: `*고객*\n${input.customerName}` }, { type: "mrkdwn", text: `*서비스*\n${input.serviceType}` },
      { type: "mrkdwn", text: `*예산*\n${input.budget}` }, { type: "mrkdwn", text: `*희망 오픈일*\n${input.desiredLaunchDate}` },
    ] },
    { type: "section", text: { type: "mrkdwn", text: `*문의 요약*\n${input.summary}` } },
    { type: "section", text: { type: "mrkdwn", text: `*답변 초안*\n${input.draft}` } },
    { type: "section", text: { type: "mrkdwn", text: `*확인 필요 사항*\n${confirmation}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: "자동 생성 초안입니다. 고객 발송 전 반드시 검토하세요." }] },
  ] };
}

export async function sendSlackNotification(input: SlackInput, options: { webhookUrl: string; fetch?: typeof fetch }) {
  const response = await (options.fetch ?? fetch)(options.webhookUrl, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildSlackMessage(input)),
  });
  if (!response.ok) throw new Error(`Slack notification failed (${response.status})`);
}
