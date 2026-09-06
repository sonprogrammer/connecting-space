import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createApprovalToken,
  hashApprovalToken,
} from "../src/entities/quote/server/token";
import { mapQuoteRpcError } from "../src/entities/quote/server/rpc-errors";

describe("견적 승인 토큰", () => {
  test("32바이트 base64url 원문과 64자리 SHA-256 해시를 만든다", () => {
    const first = createApprovalToken();
    const second = createApprovalToken();

    assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(first.tokenHash, /^[0-9a-f]{64}$/);
    assert.equal(Buffer.from(first.token, "base64url").length, 32);
    assert.equal(hashApprovalToken(first.token), first.tokenHash);
    assert.notEqual(second.token, first.token);
    assert.notEqual(second.tokenHash, first.tokenHash);
  });

  test("형식이 다르거나 32바이트가 아닌 토큰은 해시하지 않는다", () => {
    assert.equal(hashApprovalToken("short"), null);
    assert.equal(hashApprovalToken("a".repeat(43)), null);
    assert.equal(hashApprovalToken("!".repeat(43)), null);
    assert.equal(hashApprovalToken("a".repeat(44)), null);
  });
});

describe("견적 RPC 오류 매핑", () => {
  test("예상 상태는 안정적인 코드로 바꾸고 DB 원본 메시지를 숨긴다", () => {
    assert.deepEqual(mapQuoteRpcError({ code: "P0002", message: "sensitive" }), {
      code: "QUOTE_NOT_FOUND",
      message: "Quote not found",
      status: 404,
    });
    assert.deepEqual(mapQuoteRpcError({ code: "P0001", message: "sensitive" }), {
      code: "QUOTE_STATE_CONFLICT",
      message: "Quote state conflict",
      status: 409,
    });
    assert.deepEqual(mapQuoteRpcError({ code: "XX000", message: "sensitive" }), {
      code: "QUOTE_OPERATION_FAILED",
      message: "Quote operation failed",
      status: 500,
    });
  });
});
