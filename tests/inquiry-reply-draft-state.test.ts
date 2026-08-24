import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getDraftStatusCopy,
  getReplyDraftFailure,
  getSlackDeliveryPresentation,
} from "../src/features/manage-inquiry-reply/model/reply-draft-state";

describe("inquiry reply draft state", () => {
  test("keeps missing, generating, ready, and failed states distinct", () => {
    assert.equal(getDraftStatusCopy("missing").title, "AI 초안 생성 대기");
    assert.equal(getDraftStatusCopy("generating").title, "AI 초안 생성 중");
    assert.equal(getDraftStatusCopy("ready").title, "AI 답변 초안");
    assert.equal(getDraftStatusCopy("failed").title, "AI 초안 생성 실패");
  });

  test("separates Slack retry and final failure from AI status", () => {
    assert.deepEqual(getSlackDeliveryPresentation({
      status: "retry", attempt_count: 2, last_error: "timeout", sent_at: null,
    }), { label: "Slack 재시도 대기", tone: "warning", canRetry: false });
    assert.deepEqual(getSlackDeliveryPresentation({
      status: "failed", attempt_count: 3, last_error: "timeout", sent_at: null,
    }), { label: "Slack 전송 실패", tone: "danger", canRetry: true });
    assert.equal(getSlackDeliveryPresentation(null).label, "Slack 전송 기록 없음");
  });

  test("maps auth and validation failures without exposing server text", () => {
    assert.equal(getReplyDraftFailure(401, {
      error: { code: "ADMIN_AUTH_REQUIRED", message: "unauthorized" },
    }), "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.");
    assert.equal(getReplyDraftFailure(400, {
      error: { code: "VALIDATION_ERROR", message: "invalid" },
    }), "답변 초안을 확인해 주세요.");
  });
});
