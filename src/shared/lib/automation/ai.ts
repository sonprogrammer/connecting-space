import { z } from "zod";

export const aiProviderSchema = z.enum(["groq", "gemini", "openai", "custom"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

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

export type AiProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
};

const providerBaseUrls: Record<Exclude<AiProvider, "custom">, string> = {
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openai: "https://api.openai.com/v1",
};

export function resolveAiProviderConfig(input: {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}): AiProviderConfig {
  const customBaseUrl = input.baseUrl?.trim().replace(/\/$/, "");
  const baseUrl = input.provider === "custom" ? customBaseUrl : providerBaseUrls[input.provider];
  if (!baseUrl) throw new Error("AI_BASE_URL is required for the custom AI provider");
  return { provider: input.provider, apiKey: input.apiKey, model: input.model, baseUrl };
}

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
  options: AiProviderConfig & { fetch?: typeof fetch },
) {
  const fetcher = options.fetch ?? fetch;
  const prompt = buildInquiryReplyPrompt(input);
  const response = await fetcher(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "inquiry_reply", strict: true, schema: {
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
  if (!response.ok) throw new Error(`AI provider response failed (${response.status})`);
  const payload = await response.json() as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const outputText = payload.choices?.[0]?.message?.content;
  if (!outputText) throw new Error("AI provider response did not contain structured output");
  return {
    ...inquiryReplyResultSchema.parse(JSON.parse(outputText)),
    provider: options.provider,
    model: payload.model ?? options.model,
    inputTokens: payload.usage?.prompt_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? null,
    prompt,
  };
}
