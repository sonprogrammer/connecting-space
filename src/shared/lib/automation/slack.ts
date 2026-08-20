type SlackInput = {
  inquiryId: string; customerName: string; serviceType: string; budget: string;
  desiredLaunchDate: string; summary: string; draft: string;
  needsConfirmation: Array<{ topic: string; reason: string; suggestedQuestion: string }>;
  adminBaseUrl: string; email?: string; phone?: string; message?: string;
};

const SLACK_SECTION_TEXT_LIMIT = 3000;

function buildLimitedSectionText(label: string, content: string, detailUrl: string) {
  const prefix = `${label}\n`;
  const fullText = `${prefix}${content}`;
  if (fullText.length <= SLACK_SECTION_TEXT_LIMIT) return fullText;

  const notice = `\n\n…\n전체 내용은 관리자 페이지에서 확인: <${detailUrl}|상세 보기>`;
  const contentLimit = Math.max(0, SLACK_SECTION_TEXT_LIMIT - prefix.length - notice.length);
  let shortened = content.slice(0, contentLimit);
  const lastCodeUnit = shortened.charCodeAt(shortened.length - 1);
  if (lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF) shortened = shortened.slice(0, -1);
  return `${prefix}${shortened.trimEnd()}${notice}`;
}

export function buildSlackMessage(input: SlackInput) {
  const adminOrigin = new URL(input.adminBaseUrl).origin;
  const detailUrl = `${adminOrigin}/admin/inquiries/${input.inquiryId}`;
  const confirmation = input.needsConfirmation.length
    ? input.needsConfirmation.map((item) => `• *${item.topic}*: ${item.reason}\n  ${item.suggestedQuestion}`).join("\n")
    : "없음";
  return { blocks: [
    { type: "header", text: { type: "plain_text", text: "새 제작 문의 · AI 답변 초안" } },
    { type: "section", text: { type: "mrkdwn", text: `<${detailUrl}|관리자 문의 상세 보기>` } },
    { type: "section", fields: [
      { type: "mrkdwn", text: `*고객*\n${input.customerName}` }, { type: "mrkdwn", text: `*서비스*\n${input.serviceType}` },
      { type: "mrkdwn", text: `*예산*\n${input.budget}` }, { type: "mrkdwn", text: `*희망 오픈일*\n${input.desiredLaunchDate}` },
    ] },
    { type: "section", text: { type: "mrkdwn", text: buildLimitedSectionText("*문의 요약*", input.summary, detailUrl) } },
    { type: "section", text: { type: "mrkdwn", text: buildLimitedSectionText("*답변 초안*", input.draft, detailUrl) } },
    { type: "section", text: { type: "mrkdwn", text: buildLimitedSectionText("*확인 필요 사항*", confirmation, detailUrl) } },
    { type: "context", elements: [{ type: "mrkdwn", text: "자동 생성 초안입니다. 고객 발송 전 반드시 검토하세요." }] },
  ] };
}

export async function sendSlackNotification(input: SlackInput, options: { webhookUrl: string; fetch?: typeof fetch }) {
  const response = await (options.fetch ?? fetch)(options.webhookUrl, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildSlackMessage(input)),
  });
  if (!response.ok) throw new Error(`Slack notification failed (${response.status})`);
}
