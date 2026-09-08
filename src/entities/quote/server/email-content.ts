type QuoteEmailPayload = {
  recipient: string;
  customerName: string;
  title: string;
  body: string;
  scopeItems: string[];
  totalAmount: number;
  estimatedStartDate: string | null;
  estimatedEndDate: string | null;
  depositAmount: number;
  balanceAmount: number;
  depositTerms: string;
  balanceTerms: string;
  token: string;
  expiresAt: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
  }).format(new Date(value));
}

export function buildQuoteApprovalEmail(payload: QuoteEmailPayload, publicBaseUrl: string) {
  const origin = new URL(publicBaseUrl).origin;
  const approvalUrl = `${origin}/quotes/${encodeURIComponent(payload.token)}`;
  const scopeText = payload.scopeItems.map((item) => `- ${item}`).join("\n");
  const expiry = formatDate(payload.expiresAt);
  const text = `${payload.customerName}님, 견적을 보내드립니다.\n\n${payload.title}\n${payload.body}\n\n작업 범위\n${scopeText}\n\n총액: ${formatMoney(payload.totalAmount)}\n승인 링크 만료일: ${expiry}\n\n견적 확인 및 승인: ${approvalUrl}`;
  const scopeHtml = payload.scopeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const html = `<p>${escapeHtml(payload.customerName)}님, 견적을 보내드립니다.</p><h1>${escapeHtml(payload.title)}</h1><p>${escapeHtml(payload.body)}</p><h2>작업 범위</h2><ul>${scopeHtml}</ul><p>총액: ${escapeHtml(formatMoney(payload.totalAmount))}</p><p>승인 링크 만료일: ${escapeHtml(expiry)}</p><p><a href="${escapeHtml(approvalUrl)}">견적 확인 및 승인</a></p>`;
  return { to: payload.recipient, subject: `[견적] ${payload.title}`, html, text };
}

export type { QuoteEmailPayload };
