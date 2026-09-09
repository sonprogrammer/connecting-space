import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { deriveManualApprovalToken } from "../src/entities/quote/server/manual-token";
import { assertQuoteManualDeliveryEnv } from "../src/entities/quote/server/manual-env";

const versionId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const key = Buffer.alloc(32, 7).toString("base64");

describe("수동 견적 발급 토큰", () => {
  test("같은 버전과 멱등 키는 동일한 32바이트 토큰과 해시를 재현한다", () => {
    const first = deriveManualApprovalToken({ key, versionId, idempotencyKey });
    const second = deriveManualApprovalToken({ key, versionId, idempotencyKey });

    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      token: "wAAodXM0W5e9rh0D65xQ2HncrB20n5o9LrG-KpOvR3c",
      tokenHash: "cef5ab24d78d3fe7471981ecc988ea0c7e6ba129a79ebc479f0e8e2f35560b77",
      idempotencyKeyHash: "f1d11edf5c5cbe84bc60d6c543d0d5938a5bd3a833381499af7549ddc4933a23",
    });
    assert.equal(Buffer.from(first.token, "base64url").length, 32);
  });

  test("버전이나 멱등 키가 바뀌면 다른 토큰을 만든다", () => {
    const baseline = deriveManualApprovalToken({ key, versionId, idempotencyKey });
    const anotherVersion = deriveManualApprovalToken({
      key,
      versionId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey,
    });
    const anotherRequest = deriveManualApprovalToken({
      key,
      versionId,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    });

    assert.notEqual(anotherVersion.token, baseline.token);
    assert.notEqual(anotherRequest.token, baseline.token);
  });

  test("전용 키는 base64 32바이트여야 하고 공개 URL은 origin으로 고정한다", () => {
    const previousKey = process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY;
    const previousUrl = process.env.QUOTE_PUBLIC_BASE_URL;
    try {
      process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY = key;
      process.env.QUOTE_PUBLIC_BASE_URL = "https://quotes.example.test/path?unsafe=1";
      assert.deepEqual(assertQuoteManualDeliveryEnv(), {
        tokenKey: key,
        publicBaseUrl: "https://quotes.example.test",
      });

      process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY = Buffer.alloc(31).toString("base64");
      assert.throws(() => assertQuoteManualDeliveryEnv(), /32-byte key/);
      process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY = "not-base64!";
      assert.throws(() => assertQuoteManualDeliveryEnv(), /32-byte key/);
    } finally {
      if (previousKey === undefined) delete process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY;
      else process.env.QUOTE_MANUAL_DELIVERY_TOKEN_KEY = previousKey;
      if (previousUrl === undefined) delete process.env.QUOTE_PUBLIC_BASE_URL;
      else process.env.QUOTE_PUBLIC_BASE_URL = previousUrl;
    }
  });
});
