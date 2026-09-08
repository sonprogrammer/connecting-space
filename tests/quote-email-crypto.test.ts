import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decryptQuoteEmailPayload,
  encryptQuoteEmailPayload,
} from "../src/shared/lib/email/encrypted-payload";

const key = Buffer.alloc(32, 7).toString("base64");
const context = {
  jobId: "11111111-1111-4111-8111-111111111111",
  quoteVersionId: "22222222-2222-4222-8222-222222222222",
  approvalTokenId: "33333333-3333-4333-8333-333333333333",
};

describe("견적 이메일 암호화", () => {
  it("동일 payload도 랜덤 nonce로 암호화하고 정상 복호화한다", () => {
    const payload = { token: "secret-token", recipient: "qa@example.invalid" };
    const first = encryptQuoteEmailPayload(payload, context, key);
    const second = encryptQuoteEmailPayload(payload, context, key);
    assert.notEqual(first.nonce, second.nonce);
    assert.deepEqual(decryptQuoteEmailPayload(first, context, key), payload);
  });

  it("다른 행의 AAD나 변조된 인증 태그를 거부한다", () => {
    const envelope = encryptQuoteEmailPayload({ token: "secret-token" }, context, key);
    assert.throws(() => decryptQuoteEmailPayload(envelope, { ...context, jobId: crypto.randomUUID() }, key));
    const changed = `${envelope.authTag.slice(0, -2)}AA`;
    assert.throws(() => decryptQuoteEmailPayload({ ...envelope, authTag: changed }, context, key));
  });
});
