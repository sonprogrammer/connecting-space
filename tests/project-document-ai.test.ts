import assert from "node:assert/strict";
import { test } from "node:test";
import { registerPathAlias } from "./helpers/register-path-alias";
registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateProjectDocument, reviewNotice } = require("../src/entities/document/server/ai") as typeof import("../src/entities/document/server/ai");

const config = { provider: "groq" as const, apiKey: "private-key", model: "existing-model", baseUrl: "https://api.groq.com/openai/v1" };
const narrative = { title: "제작 검토", summary: "고객 요구에 맞는 웹사이트 제작 방향", scopeItems: ["반응형 화면 설계"] };

test("existing provider generates review-only narrative and mandatory confirmations", async () => {
  const result = await generateProjectDocument("contract", { project: { name: "fixture" } }, {
    ...config, fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.model, "existing-model");
      assert.equal(init?.redirect, "error");
      assert.match(request.messages[0].content, /검토용 초안/);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(narrative) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    },
  });
  assert.equal(result.content.reviewNotice, reviewNotice);
  assert.deepEqual(result.content.needsConfirmation.map((x) => x.category), ["price", "schedule", "legal"]);
  assert.equal(result.inputTokens, 10);
});

test("provider output cannot establish money, dates or legal conditions", async () => {
  for (const summary of ["비용은 500만원입니다", "완료 일정은 2026-12-01", "위약금과 손해배상 의무가 확정됩니다"]) {
    await assert.rejects(generateProjectDocument("contract", {}, { ...config, fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...narrative, summary }) } }] })) }), /AI_OUTPUT_INVALID/);
  }
});

test("provider errors and unsafe URL never expose private details", async () => {
  await assert.rejects(generateProjectDocument("proposal", {}, { ...config, fetch: async () => new Response("private-key private@example.test", { status: 429 }) }), /^Error: AI_PROVIDER_FAILED$/);
  await assert.rejects(generateProjectDocument("proposal", {}, { ...config, baseUrl: "http://127.0.0.1/private" }), /AI_CONFIGURATION_INVALID/);
});
