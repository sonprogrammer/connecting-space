import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuoteExpirationSlackMessage } from "../src/entities/quote/server/expiration-slack";

describe("견적 만료 Slack 알림", () => {
  it("견적 식별자·버전·만료·관리자 링크만 포함한다", () => {
    const message = buildQuoteExpirationSlackMessage({
      quoteId: "11111111-1111-4111-8111-111111111111", versionNumber: 2,
      expiresAt: "2026-09-08T03:00:00.000Z", adminBaseUrl: "https://admin.example.test/path",
    });
    const serialized = JSON.stringify(message);
    assert.match(serialized, /견적 승인 링크 만료 예정/);
    assert.match(serialized, /버전 2/);
    assert.match(serialized, /https:\/\/admin\.example\.test\/admin\/quotes\//);
    assert.doesNotMatch(serialized, /email|customer|본문/);
  });
});
