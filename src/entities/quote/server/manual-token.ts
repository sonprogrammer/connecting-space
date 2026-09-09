import { createHash, createHmac } from "node:crypto";

import { hashApprovalToken } from "./token";

const TOKEN_CONTEXT = "quote-manual-delivery-v1";

export function deriveManualApprovalToken(input: {
  key: string;
  quoteVersionId?: string;
  versionId?: string;
  idempotencyKey: string;
}) {
  const versionId = input.quoteVersionId ?? input.versionId;
  if (!versionId) throw new Error("QUOTE_VERSION_ID_REQUIRED");
  const keyBytes = decodeBase64Key(input.key);
  const token = createHmac("sha256", keyBytes)
    .update(`${TOKEN_CONTEXT}\0${versionId}\0${input.idempotencyKey}`)
    .digest("base64url");
  const tokenHash = hashApprovalToken(token);
  if (!tokenHash) throw new Error("MANUAL_TOKEN_GENERATION_FAILED");
  return {
    token,
    tokenHash,
    idempotencyKeyHash: createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex"),
  };
}

function decodeBase64Key(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(value)) {
    throw new Error("QUOTE_MANUAL_DELIVERY_TOKEN_KEY must be a base64-encoded 32-byte key");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new Error("QUOTE_MANUAL_DELIVERY_TOKEN_KEY must be a base64-encoded 32-byte key");
  }
  return decoded;
}

export function assertManualTokenKey(value: string) {
  decodeBase64Key(value);
  return value;
}
