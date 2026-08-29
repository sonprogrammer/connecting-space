import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReplyDraftGenerationJobStatus } from "../src/features/manage-inquiry-reply/ui/reply-draft-generation-job-status";

describe("reply draft generation job status UI", () => {
  test("labels the first pending schedule without calling it a retry", () => {
    const markup = renderToStaticMarkup(
      createElement(ReplyDraftGenerationJobStatus, {
        generationJob: {
          id: "job-pending",
          status: "pending",
          attemptCount: 0,
          maxAttempts: 3,
          availableAt: "2026-08-29T02:30:00.000Z",
          lastError: null,
        },
      }),
    );

    assert.match(markup, /AI 생성 대기/);
    assert.match(markup, /실행 예정/);
    assert.doesNotMatch(markup, /다음 재시도/);
    assert.match(markup, /dateTime="2026-08-29T02:30:00.000Z"/);
  });

  test("shows retry attempts and the next scheduled attempt separately from Slack", () => {
    const markup = renderToStaticMarkup(
      createElement(ReplyDraftGenerationJobStatus, {
        generationJob: {
          id: "job-1",
          status: "retry",
          attemptCount: 2,
          maxAttempts: 3,
          availableAt: "2026-08-29T02:30:00.000Z",
          lastError: "AI provider request failed",
        },
      }),
    );

    assert.match(markup, /AI 생성 재시도 대기/);
    assert.match(markup, /시도 2 \/ 3회/);
    assert.match(markup, /다음 재시도/);
    assert.match(markup, /dateTime="2026-08-29T02:30:00.000Z"/);
    assert.match(markup, /AI provider request failed/);
  });

  test("announces the final AI generation failure as an alert", () => {
    const markup = renderToStaticMarkup(
      createElement(ReplyDraftGenerationJobStatus, {
        generationJob: {
          id: "job-2",
          status: "failed",
          attemptCount: 3,
          maxAttempts: 3,
          availableAt: null,
          lastError: "AI generation exhausted",
        },
        action: createElement("button", { type: "button" }, "다시 생성"),
      }),
    );

    assert.match(markup, /role="alert"/);
    assert.match(markup, /AI 생성 최종 실패/);
    assert.match(markup, /AI generation exhausted/);
    assert.match(markup, /다시 생성/);
  });
});
