import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  authTag: string;
};

export type QuoteEmailEncryptionContext = {
  jobId: string;
  quoteVersionId: string;
  approvalTokenId: string;
};

function decodeKey(encoded: string) {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("INVALID_QUOTE_EMAIL_ENCRYPTION_KEY");
  return key;
}

function aad(context: QuoteEmailEncryptionContext) {
  return Buffer.from(JSON.stringify([
    "quote-email-v1",
    context.jobId,
    context.quoteVersionId,
    context.approvalTokenId,
  ]));
}

export function encryptQuoteEmailPayload(
  payload: unknown,
  context: QuoteEmailEncryptionContext,
  encodedKey: string,
): EncryptedPayload {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptQuoteEmailPayload<T = unknown>(
  envelope: EncryptedPayload,
  context: QuoteEmailEncryptionContext,
  encodedKey: string,
): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeKey(encodedKey),
    Buffer.from(envelope.nonce, "base64"),
  );
  decipher.setAAD(aad(context));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
