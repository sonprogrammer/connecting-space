import { z } from "zod";

export const inquiryReplyResultSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  draft: z.string().trim().min(1).max(12000),
  needsConfirmation: z.array(z.object({
    topic: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(1000),
    suggestedQuestion: z.string().trim().min(1).max(1000),
  }).strict()).max(30),
}).strict();

type ReplyInput = {
  inquiry: Record<string, unknown>;
  offerings: unknown[];
  faqs: unknown[];
};

export function buildInquiryReplyPrompt(input: ReplyInput) {
  return [
    "다음 문의에 대한 정중한 한국어 답변 초안을 작성하세요.",
    "서비스/FAQ 데이터에 없는 가격, 할인, 기간, 범위는 절대 확정하지 마세요.",
    "희망 일정은 실제 가능 일정이 아닙니다. 근거가 부족하거나 충돌하면 needsConfirmation에 분리하세요.",
    "법률, 세무, 결제 확정 또는 고객에게 이미 승인된 것처럼 표현하지 마세요.",
    `문의: ${JSON.stringify(input.inquiry)}`,
    `공개 서비스 근거: ${JSON.stringify(input.offerings)}`,
    `공개 FAQ 근거: ${JSON.stringify(input.faqs)}`,
  ].join("\n");
}

export async function generateInquiryReply(
  input: ReplyInput,
  options: { apiKey: string; model: string; fetch?: typeof fetch },
) {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model, store: false,
      input: [{ role: "user", content: buildInquiryReplyPrompt(input) }],
      text: { format: { type: "json_schema", name: "inquiry_reply", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: {
          summary: { type: "string" }, draft: { type: "string" },
          needsConfirmation: { type: "array", items: { type: "object", additionalProperties: false,
            properties: { topic: { type: "string" }, reason: { type: "string" }, suggestedQuestion: { type: "string" } },
            required: ["topic", "reason", "suggestedQuestion"] } },
        }, required: ["summary", "draft", "needsConfirmation"],
      } } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI response failed (${response.status})`);
  const payload = await response.json() as {
    output_text?: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number };
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI response did not contain structured output");
  return { ...inquiryReplyResultSchema.parse(JSON.parse(outputText)), model: payload.model ?? options.model,
    inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null,
    prompt: buildInquiryReplyPrompt(input) };
}
