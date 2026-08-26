import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createServiceOfferingSchema,
  updateFaqSchema,
} from "../src/entities/automation/schemas/content.schema";
import {
  generateInquiryReply,
  inquiryReplyResultSchema,
  resolveAiProviderConfig,
} from "../src/shared/lib/automation/ai";
import { buildSlackMessage, sendSlackNotification } from "../src/shared/lib/automation/slack";
import { nextFailureState, redactAutomationError } from "../src/shared/lib/automation/errors";
import {
  assertAiEnv,
  assertAutomationProcessEnv,
  assertSlackEnv,
} from "../src/shared/config/env";

const automationEnvNames = [
  "AI_PROVIDER",
  "AI_API_KEY",
  "AI_MODEL",
  "AI_BASE_URL",
  "SLACK_INQUIRY_WEBHOOK_URL",
  "AUTOMATION_PROCESS_SECRET",
  "ADMIN_BASE_URL",
] as const;

function withAutomationEnv(
  values: Partial<Record<(typeof automationEnvNames)[number], string>>,
  assertion: () => void,
) {
  const previous = Object.fromEntries(
    automationEnvNames.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of automationEnvNames) delete process.env[name];
    Object.assign(process.env, values);
    assertion();
  } finally {
    for (const name of automationEnvNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("automation content schemas", () => {
  it("normalizes an offering and rejects inverted prices", () => {
    const valid = createServiceOfferingSchema.parse({
      slug: "landing-page", name: " 랜딩페이지 ", description: " 설명 ",
      priceLabel: "상담 후 확정", priceMin: 10, priceMax: 20,
      durationLabel: "상담 후 확정", includedItems: [" 기획 "], excludedItems: [],
      aiGuidance: " 확인 ", isPublished: false, sortOrder: 0,
    });
    assert.equal(valid.name, "랜딩페이지");
    assert.deepEqual(valid.includedItems, ["기획"]);
    assert.equal(createServiceOfferingSchema.safeParse({ ...valid, priceMin: 30, priceMax: 20 }).success, false);
  });

  it("requires a nonempty FAQ patch", () => {
    assert.equal(updateFaqSchema.safeParse({}).success, false);
    assert.equal(updateFaqSchema.parse({ question: " 질문 " }).question, "질문");
  });
});

describe("provider-neutral AI inquiry reply", () => {
  it("validates AI, Slack, and worker credentials independently", () => {
    withAutomationEnv({
      AI_PROVIDER: "openai",
      AI_API_KEY: "test-key",
      AI_MODEL: "test-model",
    }, () => {
      assert.equal(assertAiEnv().provider, "openai");
      assert.throws(() => assertSlackEnv(), /SLACK_INQUIRY_WEBHOOK_URL/);
      assert.throws(() => assertAutomationProcessEnv(), /AUTOMATION_PROCESS_SECRET/);
    });

    withAutomationEnv({
      SLACK_INQUIRY_WEBHOOK_URL: "https://hooks.slack.test/example",
      ADMIN_BASE_URL: "https://admin.example.com",
    }, () => {
      assert.deepEqual(assertSlackEnv(), {
        slackWebhookUrl: "https://hooks.slack.test/example",
        adminBaseUrl: "https://admin.example.com",
      });
      assert.throws(() => assertAiEnv(), /AI_PROVIDER/);
    });

    withAutomationEnv({ AUTOMATION_PROCESS_SECRET: "worker-secret" }, () => {
      assert.deepEqual(assertAutomationProcessEnv(), { processSecret: "worker-secret" });
      assert.throws(() => assertAiEnv(), /AI_PROVIDER/);
      assert.throws(() => assertSlackEnv(), /SLACK_INQUIRY_WEBHOOK_URL/);
    });
  });

  it("resolves provider presets without changing application code", () => {
    assert.equal(resolveAiProviderConfig({ provider: "groq", apiKey: "key", model: "model" }).baseUrl, "https://api.groq.com/openai/v1");
    assert.equal(resolveAiProviderConfig({ provider: "gemini", apiKey: "key", model: "model" }).baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
    assert.equal(resolveAiProviderConfig({ provider: "openai", apiKey: "key", model: "model" }).baseUrl, "https://api.openai.com/v1");
    assert.equal(resolveAiProviderConfig({ provider: "custom", apiKey: "key", model: "model", baseUrl: "https://ai.example.com/v1/" }).baseUrl, "https://ai.example.com/v1");
    assert.throws(() => resolveAiProviderConfig({ provider: "custom", apiKey: "key", model: "model" }));
  });

  it("sends a portable chat-completions JSON schema request", async () => {
    assert.equal(inquiryReplyResultSchema.safeParse({ summary: "요약", draft: "초안", needsConfirmation: [] }).success, true);
    let requestBody: Record<string, unknown> = {};
    let requestUrl = "";
    const result = await generateInquiryReply(
      { inquiry: { customerName: "김고객", serviceType: "landing", message: "제작 문의 내용입니다." }, offerings: [], faqs: [] },
      { ...resolveAiProviderConfig({ provider: "groq", apiKey: "secret", model: "test-model" }), fetch: async (url, init) => {
        requestUrl = String(url);
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ model: "test-model", choices: [{ message: { content: JSON.stringify({ summary: "요약", draft: "초안", needsConfirmation: [] }) } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
      } },
    );
    assert.equal(requestUrl, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal((requestBody.response_format as { type: string }).type, "json_schema");
    assert.equal((requestBody.response_format as { json_schema: { strict: boolean } }).json_schema.strict, true);
    assert.equal(result.provider, "groq");
    assert.equal(result.summary, "요약");
  });
});

describe("Slack privacy", () => {
  const input = {
    inquiryId: "00000000-0000-4000-8000-000000000001", customerName: "김고객",
    serviceType: "landing", budget: "상담", desiredLaunchDate: "미정",
    email: "secret@example.com", phone: "010-1234-5678", message: "민감한 원문 전체",
    summary: "요약", draft: "초안", needsConfirmation: [{ topic: "일정", reason: "근거 부족", suggestedQuestion: "가능 일정을 확인해 주세요." }],
    adminBaseUrl: "https://admin.example.com",
  };
  const getSectionTexts = (message: ReturnType<typeof buildSlackMessage>) => message.blocks.flatMap((block) => {
    const text = (block as { text?: { text?: unknown } }).text?.text;
    return typeof text === "string" ? [text] : [];
  });
  const getSectionFieldTexts = (message: ReturnType<typeof buildSlackMessage>) => message.blocks.flatMap((block) => {
    const fields = (block as { fields?: Array<{ text?: unknown }> }).fields ?? [];
    return fields.flatMap((field) => typeof field.text === "string" ? [field.text] : []);
  });

  it("omits contact details and full inquiry text", () => {
    const serialized = JSON.stringify(buildSlackMessage(input));
    assert.equal(serialized.includes(input.email), false);
    assert.equal(serialized.includes(input.phone), false);
    assert.equal(serialized.includes(input.message), false);
    assert.match(serialized, /김고객/);
  });

  it("keeps the exact 3,000-character draft boundary without truncation", () => {
    const message = buildSlackMessage({ ...input, draft: "가".repeat(2992) });
    const draftText = getSectionTexts(message).find((text) => text.startsWith("*답변 초안*"));
    assert.ok(draftText);
    assert.equal(draftText.length, 3000);
    assert.equal(draftText.includes("전체 내용은 관리자 페이지에서 확인"), false);
  });

  it("truncates a 12,000-character draft and links to the full admin detail", () => {
    const message = buildSlackMessage({ ...input, draft: "가".repeat(12000) });
    const sectionTexts = getSectionTexts(message);
    const draftText = sectionTexts.find((text) => text.startsWith("*답변 초안*"));
    assert.ok(draftText);
    assert.equal(sectionTexts.every((text) => text.length <= 3000), true);
    assert.match(draftText, /전체 내용은 관리자 페이지에서 확인/);
    assert.match(draftText, /https:\/\/admin\.example\.com\/admin\/inquiries\/00000000-0000-4000-8000-000000000001/);
  });

  it("truncates 30 maximum-sized confirmation items within every section limit", () => {
    const needsConfirmation = Array.from({ length: 30 }, (_, index) => ({
      topic: `${index}`.padEnd(200, "주"),
      reason: "이".repeat(1000),
      suggestedQuestion: "질".repeat(1000),
    }));
    const message = buildSlackMessage({ ...input, draft: "가".repeat(12000), needsConfirmation });
    const sectionTexts = getSectionTexts(message);
    const confirmationText = sectionTexts.find((text) => text.startsWith("*확인 필요 사항*"));
    assert.ok(confirmationText);
    assert.equal(sectionTexts.every((text) => text.length <= 3000), true);
    assert.match(confirmationText, /전체 내용은 관리자 페이지에서 확인/);
    assert.match(confirmationText, /https:\/\/admin\.example\.com\/admin\/inquiries\/00000000-0000-4000-8000-000000000001/);
    assert.equal(getSectionFieldTexts(message).every((text) => text.length <= 2000), true);
  });

  it("uses only the admin origin so a long base path cannot overflow sections", () => {
    const message = buildSlackMessage({
      ...input,
      adminBaseUrl: `https://admin.example.com/${"경로".repeat(1600)}`,
      draft: "가".repeat(12000),
    });
    const sectionTexts = getSectionTexts(message);
    assert.equal(sectionTexts.every((text) => text.length <= 3000), true);
    assert.equal(sectionTexts.every((text) => !text.includes("경로")), true);
    assert.equal(sectionTexts.some((text) => text.includes("https://admin.example.com/admin/inquiries/")), true);
  });

  it("rejects non-2xx webhooks without exposing the URL", async () => {
    await assert.rejects(
      sendSlackNotification(input, { webhookUrl: "https://hooks.slack.test/secret", fetch: async () => new Response("private body", { status: 500 }) }),
      (error: Error) => error.message === "Slack notification failed (500)" && !error.message.includes("secret"),
    );
  });
});

describe("automation failures", () => {
  it("retries exponentially and fails on the third attempt", () => {
    assert.deepEqual(nextFailureState(1, 3, new Date("2026-08-20T00:00:00Z")), { status: "retry", availableAt: "2026-08-20T00:01:00.000Z" });
    assert.deepEqual(nextFailureState(3, 3, new Date("2026-08-20T00:00:00Z")), { status: "failed", availableAt: null });
  });

  it("redacts secrets and contact details from errors", () => {
    const safe = redactAutomationError(new Error("key sk-secret hook https://hooks.slack.com/x email a@b.com phone 010-1234-5678"));
    assert.equal(safe.includes("sk-secret"), false);
    assert.equal(safe.includes("a@b.com"), false);
    assert.equal(safe.includes("010-1234-5678"), false);
  });
});
