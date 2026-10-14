import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getDraftStatusCopy,
  getReplyDraftFailure,
  getSlackDeliveryPresentation,
  markReplyDraftRegenerationPending,
} from "../src/features/manage-inquiry-reply/model/reply-draft-state";
import {
  emptyReplyDraftFormState,
  syncReplyDraftFormState,
} from "../src/features/manage-inquiry-reply/model/reply-draft-form-state";

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

  test("clears the previous generation job when regeneration starts", () => {
    const pending = markReplyDraftRegenerationPending({
      id: "draft-1",
      inquiryId: "inquiry-1",
      generationRecordId: "record-1",
      generationRecord: {
        id: "record-1",
        provider: "openai",
        model: "gpt-4.1-mini",
        createdAt: "2026-08-29T00:00:00.000Z",
      },
      summary: "문의 요약",
      draft: "답변 초안",
      needsConfirmation: [],
      status: "failed",
      lastError: "previous failure",
      updatedAt: "2026-08-29T00:00:00.000Z",
      generationJob: {
        id: "old-job",
        status: "failed",
        attemptCount: 3,
        maxAttempts: 3,
        availableAt: null,
        lastError: "previous failure",
      },
      slackDelivery: null,
    });

    assert.equal(pending.status, "generating");
    assert.equal(pending.lastError, null);
    assert.equal(pending.generationJob, null);
  });

  test("preserves unsaved summary and body edits when a background refetch returns", () => {
    const initial = syncReplyDraftFormState(emptyReplyDraftFormState, {
      inquiryId: "inquiry-1",
      summary: "서버 요약",
      draft: "서버 본문",
    });
    const editing = { ...initial, summary: "수정 중 요약", draft: "수정 중 본문" };

    const afterRefetch = syncReplyDraftFormState(editing, {
      inquiryId: "inquiry-1",
      summary: "최신 서버 요약",
      draft: "최신 서버 본문",
    });

    assert.equal(afterRefetch.summary, "수정 중 요약");
    assert.equal(afterRefetch.draft, "수정 중 본문");
  });

  test("updates untouched fields from a refetch while retaining the edited field", () => {
    const initial = syncReplyDraftFormState(emptyReplyDraftFormState, {
      inquiryId: "inquiry-1",
      summary: "서버 요약",
      draft: "서버 본문",
    });
    const editing = { ...initial, summary: "수정 중 요약" };

    const afterRefetch = syncReplyDraftFormState(editing, {
      inquiryId: "inquiry-1",
      summary: "최신 서버 요약",
      draft: "최신 서버 본문",
    });

    assert.equal(afterRefetch.summary, "수정 중 요약");
    assert.equal(afterRefetch.draft, "최신 서버 본문");
  });

  test("hydrates a different inquiry instead of carrying edits across IDs", () => {
    const editing = { ...emptyReplyDraftFormState, inquiryId: "inquiry-1", summary: "수정 중 요약", draft: "수정 중 본문", serverSummary: "서버 요약", serverDraft: "서버 본문" };

    const nextInquiry = syncReplyDraftFormState(editing, {
      inquiryId: "inquiry-2",
      summary: "다른 문의 요약",
      draft: "다른 문의 본문",
    });

    assert.equal(nextInquiry.summary, "다른 문의 요약");
    assert.equal(nextInquiry.draft, "다른 문의 본문");
  });
});
