import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adminReplyDraftQueryKeys, fetchAdminReplyDraft } from "../src/features/manage-inquiry-reply/model/reply-draft-queries";

describe("admin reply draft cache", () => {
  test("keys drafts by inquiry and requests the API without browser caching", async () => {
    assert.notDeepEqual(adminReplyDraftQueryKeys.detail("inquiry-a"), adminReplyDraftQueryKeys.detail("inquiry-b"));
    const previousFetch = globalThis.fetch;
    let cache: RequestCache | undefined;
    globalThis.fetch = (async (_input, init) => {
      cache = init?.cache;
      return new Response(JSON.stringify({ error: { code: "REPLY_DRAFT_NOT_FOUND", message: "missing" } }), { status: 404 });
    }) as typeof fetch;
    try {
      await assert.rejects(fetchAdminReplyDraft("inquiry-a"));
      assert.equal(cache, "no-store");
    } finally { globalThis.fetch = previousFetch; }
  });
});
