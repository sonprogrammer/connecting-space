import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createApprovalToken() {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashApprovalToken(token: string) {
  if (token.length !== TOKEN_LENGTH || !TOKEN_PATTERN.test(token)) {
    return null;
  }

  const decoded = Buffer.from(token, "base64url");
  if (
    decoded.length !== TOKEN_BYTES ||
    decoded.toString("base64url") !== token
  ) {
    return null;
  }

  return hashToken(token);
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
