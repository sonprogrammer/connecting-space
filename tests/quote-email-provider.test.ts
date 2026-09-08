import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendTransactionalEmail } from "../src/shared/lib/email/resend";

describe("Resend 공통 이메일 provider", () => {
  it("고정 idempotency key로 이메일을 보내고 provider id를 반환한다", async () => {
    const calls: Request[] = [];
    const result = await sendTransactionalEmail({
      from: "발신자 <sender@example.invalid>", to: "qa@example.invalid",
      subject: "견적", html: "<p>견적</p>", text: "견적",
    }, {
      apiKey: "test-api-key", idempotencyKey: "quote-approval/job-id",
      fetch: async (input, init) => {
        calls.push(new Request(input, init));
        return Response.json({ id: "provider-message-id" });
      },
    });
    assert.deepEqual(result, { id: "provider-message-id" });
    assert.equal(calls[0].headers.get("idempotency-key"), "quote-approval/job-id");
    assert.equal(calls[0].headers.get("authorization"), "Bearer test-api-key");
  });

  it("provider 오류 본문과 수신 주소를 예외에 노출하지 않는다", async () => {
    await assert.rejects(
      sendTransactionalEmail({
        from: "sender@example.invalid", to: "private@example.invalid",
        subject: "견적", html: "private body", text: "private body",
      }, {
        apiKey: "private-key", idempotencyKey: "quote-approval/job-id",
        fetch: async () => new Response("private@example.invalid private-key", { status: 500 }),
      }),
      (error: unknown) => error instanceof Error
        && error.message === "RESEND_RETRYABLE"
        && !error.message.includes("private"),
    );
  });
});
