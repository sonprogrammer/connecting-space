import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createServiceOfferingSchema,
  updateFaqSchema,
} from "../src/entities/automation/schemas/content.schema";
import {
  generateInquiryReply,
  inquiryReplyResultSchema,
} from "../src/shared/lib/automation/openai";
import { buildSlackMessage, sendSlackNotification } from "../src/shared/lib/automation/slack";
import { nextFailureState, redactAutomationError } from "../src/shared/lib/automation/errors";

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

describe("OpenAI inquiry reply", () => {
  it("validates the strict reply shape and sends structured output with no storage", async () => {
    assert.equal(inquiryReplyResultSchema.safeParse({ summary: "요약", draft: "초안", needsConfirmation: [] }).success, true);
    let requestBody: Record<string, unknown> = {};
    const result = await generateInquiryReply(
      { inquiry: { customerName: "김고객", serviceType: "landing", message: "제작 문의 내용입니다." }, offerings: [], faqs: [] },
      { apiKey: "secret", model: "test-model", fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ model: "test-model", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "요약", draft: "초안", needsConfirmation: [] }) }] }], usage: { input_tokens: 2, output_tokens: 3 } }));
      } },
    );
    assert.equal(requestBody.store, false);
    assert.equal((requestBody.text as { format: { type: string } }).format.type, "json_schema");
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

  it("omits contact details and full inquiry text", () => {
    const serialized = JSON.stringify(buildSlackMessage(input));
    assert.equal(serialized.includes(input.email), false);
    assert.equal(serialized.includes(input.phone), false);
    assert.equal(serialized.includes(input.message), false);
    assert.match(serialized, /김고객/);
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
