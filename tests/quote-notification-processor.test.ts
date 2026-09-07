import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/shared/types/database.generated";
import { encryptQuoteEmailPayload } from "../src/shared/lib/email/encrypted-payload";
import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();

const key = Buffer.alloc(32, 2).toString("base64");
const jobId = "11111111-1111-4111-8111-111111111111";
const quoteId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const tokenId = "44444444-4444-4444-8444-444444444444";
const dispatchAt = "2026-09-07T03:00:00.000Z";
const payload = {
  recipient: "qa@example.invalid", customerName: "고객", title: "견적", body: "본문",
  scopeItems: ["개발"], totalAmount: 1000, estimatedStartDate: null, estimatedEndDate: null,
  depositAmount: 300, balanceAmount: 700, depositTerms: "선금", balanceTerms: "잔금", token: "secret-token",
};
const encrypted = encryptQuoteEmailPayload(payload, { jobId, quoteVersionId: versionId, approvalTokenId: tokenId }, key);
const job = {
  id: jobId, quote_id: quoteId, quote_version_id: versionId, approval_token_id: tokenId,
  generation: 1, status: "processing", encrypted_payload: encrypted.ciphertext,
  payload_nonce: encrypted.nonce, payload_auth_tag: encrypted.authTag, attempt_count: 1,
  max_attempts: 3, available_at: dispatchAt, locked_at: dispatchAt, locked_by: "worker",
  provider_message_id: null, dispatch_started_at: dispatchAt, error_code: null, sent_at: null,
  completed_at: null, superseded_at: null, created_at: dispatchAt, updated_at: dispatchAt,
} satisfies Database["public"]["Tables"]["quote_email_deliveries"]["Row"];

describe("견적 알림 worker", () => {
  it("동일 작업을 동일 Resend payload와 idempotency key로 보내고 finalize한다", async () => {
    const { processQuoteEmailDelivery } = await import("../src/shared/lib/automation/quote-notification-processor");
    const fake = createClientStub(true);
    const requests: Array<{ body: string; key: string | null }> = [];
    const result = await processQuoteEmailDelivery(job, {
      client: fake.client, config: config(),
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push({ body: await request.text(), key: request.headers.get("idempotency-key") });
        return Response.json({ id: "provider-id" });
      },
    });
    assert.equal(result.status, "sent");
    assert.equal(requests[0].key, `quote-approval/${jobId}`);
    assert.match(requests[0].body, /2026년 9월 14일/);
    assert.equal(fake.rpcCalls.some((call) => call.name === "finalize_quote_email_delivery"), true);
  });

  it("무효 토큰은 Resend를 호출하지 않고 안전한 실패 코드를 기록한다", async () => {
    const { processQuoteEmailDelivery } = await import("../src/shared/lib/automation/quote-notification-processor");
    const fake = createClientStub(false);
    let providerCalled = false;
    const result = await processQuoteEmailDelivery(job, {
      client: fake.client, config: config(), fetch: async () => { providerCalled = true; return Response.json({ id: "bad" }); },
    });
    assert.equal(providerCalled, false);
    assert.equal(result.status, "retry");
    assert.deepEqual(fake.rpcCalls.at(-1), {
      name: "fail_quote_email_delivery",
      args: { p_job_id: jobId, p_error_code: "QUOTE_EMAIL_TOKEN_UNAVAILABLE" },
    });
  });

  it("Resend 성공 후 finalize가 실패해도 같은 요청으로 재호출해 복구한다", async () => {
    const { processQuoteEmailDelivery } = await import("../src/shared/lib/automation/quote-notification-processor");
    const fake = createClientStub(true, 1);
    const requests: Array<{ body: string; key: string | null }> = [];
    const send = async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push({ body: await request.text(), key: request.headers.get("idempotency-key") });
      return Response.json({ id: "same-provider-id" });
    };

    const first = await processQuoteEmailDelivery(job, { client: fake.client, config: config(), fetch: send });
    const second = await processQuoteEmailDelivery(job, { client: fake.client, config: config(), fetch: send });

    assert.equal(first.status, "retry");
    assert.equal(second.status, "sent");
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(requests[0].key, `quote-approval/${jobId}`);
  });
});

function config() { return { apiKey: "test-key", fromEmail: "sender@example.invalid", encryptionKey: key, publicBaseUrl: "https://public.example.test" }; }

function createClientStub(valid: boolean, finalizeFailures = 0) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  let remainingFinalizeFailures = finalizeFailures;
  const client = {
    from(table: string) {
      return { select() { return { eq() { return { maybeSingle: async () => ({ data: table === "quote_approval_tokens"
        ? { id: tokenId, revoked_at: valid ? null : dispatchAt, used_at: null, expires_at: null }
        : { id: quoteId, status: "draft", latest_version_id: versionId }, error: null }) }; } }; } };
    },
    async rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      if (name === "finalize_quote_email_delivery" && remainingFinalizeFailures > 0) {
        remainingFinalizeFailures -= 1;
        return { data: null, error: { message: "temporary finalize failure" } };
      }
      return { data: job, error: null };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, rpcCalls };
}
