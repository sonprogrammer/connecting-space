import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReplyDraftGenerationMetadata } from "../src/features/manage-inquiry-reply/ui/reply-draft-generation-metadata";

describe("reply draft generation metadata UI", () => {
  test("renders provider, API model name, and generation time from the linked record", () => {
    const markup = renderToStaticMarkup(createElement(
      ReplyDraftGenerationMetadata,
      { generationRecord: {
          id: "33333333-3333-4333-8333-333333333333",
          provider: "groq",
          model: "openai/gpt-oss-120b",
          createdAt: "2026-08-20T10:00:00.000Z",
        } },
    ));

    assert.match(markup, /제공자/);
    assert.match(markup, /groq/);
    assert.match(markup, /모델/);
    assert.match(markup, /openai\/gpt-oss-120b/);
    assert.match(markup, /생성 시각/);
    assert.match(markup, /dateTime="2026-08-20T10:00:00.000Z"/);
  });

  test("shows an explicit empty state without inventing a model name", () => {
    const markup = renderToStaticMarkup(createElement(
      ReplyDraftGenerationMetadata,
      { generationRecord: null },
    ));

    assert.match(markup, /생성 메타데이터 없음/);
    assert.doesNotMatch(markup, /GPT|Claude|Gemini|Llama/i);
  });
});
