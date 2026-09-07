import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

import { createApprovalToken } from "../src/entities/quote/server/token";
import type { Database } from "../src/shared/types/database.generated";

const enabled = process.env.RUN_QUOTE_INTEGRATION_TESTS === "1";

describe("로컬 견적 이메일 PostgreSQL 통합", { skip: !enabled }, () => {
  test("enqueue·발송 확정·retry·재발급·만료 알림을 원자적이고 멱등하게 처리한다", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(url && anonKey && serviceKey);
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "로컬 Supabase에서만 실행할 수 있습니다.");

    const service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
    const login = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const email = `quote-email-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}!`;
    const createdUser = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(createdUser.error, null, createdUser.error?.message);
    const userId = createdUser.data.user.id;
    assert.equal((await service.from("admins").insert({ id: userId, email })).error, null);
    const signedIn = await login.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, signedIn.error?.message);
    const admin = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
    });

    const inquiry = await service.from("inquiries").insert({
      customer_name: "로컬 이메일 고객", email: "recipient@local.test", service_type: "아임웹 제작",
      message: "견적 이메일 통합 테스트", source: "integration_test",
    }).select("id").single();
    assert.equal(inquiry.error, null, inquiry.error?.message);
    const created = await admin.rpc("create_quote_with_version", { p_inquiry_id: inquiry.data.id, ...snapshotArgs() });
    assert.equal(created.error, null, created.error?.message);
    const quoteId = created.data?.[0]?.created_quote_id;
    const versionId = created.data?.[0]?.created_quote_version_id;
    assert.ok(quoteId && versionId);

    const first = enqueueArgs(versionId, "first encrypted recipient and token");
    const second = enqueueArgs(versionId, "second encrypted recipient and token");
    const enqueued = await Promise.all([
      admin.rpc("enqueue_quote_email_delivery", first),
      admin.rpc("enqueue_quote_email_delivery", second),
    ]);
    enqueued.forEach((result) => assert.equal(result.error, null, result.error?.message));
    assert.deepEqual(enqueued.map((result) => result.data?.[0]?.result).sort(), ["created", "existing"]);

    const deliveries = await service.from("quote_email_deliveries").select("*").eq("quote_version_id", versionId);
    const tokens = await service.from("quote_approval_tokens").select("*").eq("quote_version_id", versionId);
    assert.equal(deliveries.data?.length, 1);
    assert.equal(tokens.data?.length, 1);
    assert.equal(tokens.data?.[0]?.expires_at, null);
    assert.equal((await service.from("quotes").select("status").eq("id", quoteId).single()).data?.status, "draft");
    const serialized = JSON.stringify(deliveries.data?.[0]);
    assert.doesNotMatch(serialized, /recipient@local\.test|approval-token|\/quotes\//);

    const activeJob = deliveries.data?.[0];
    assert.ok(activeJob);
    const sentAt = "2026-09-07T03:00:00.000Z";
    const claimed = await service.rpc("claim_quote_email_deliveries", { p_worker_id: "integration", p_limit: 5, p_now: sentAt });
    assert.equal(claimed.error, null, claimed.error?.message);
    assert.equal(claimed.data?.[0]?.id, activeJob.id);
    const finalized = await service.rpc("finalize_quote_email_delivery", {
      p_job_id: activeJob.id, p_provider_message_id: "provider-local-id", p_sent_at: sentAt,
    });
    assert.equal(finalized.error, null, finalized.error?.message);
    assert.equal((await service.from("quotes").select("status").eq("id", quoteId).single()).data?.status, "sent");
    const expiry = (await service.from("quote_approval_tokens").select("expires_at").eq("id", activeJob.approval_token_id).single()).data?.expires_at;
    assert.equal(expiry, "2026-09-14T03:00:00+00:00");

    const duplicate = await admin.rpc("enqueue_quote_email_delivery", enqueueArgs(versionId, "discarded plaintext"));
    assert.equal(duplicate.data?.[0]?.result, "existing");
    assert.equal(duplicate.data?.[0]?.delivery.id, activeJob.id);

    const alertAt = "2026-09-13T12:00:00.000Z";
    const firstSchedule = await service.rpc("schedule_quote_lifecycle", { p_now: alertAt });
    const secondSchedule = await service.rpc("schedule_quote_lifecycle", { p_now: alertAt });
    assert.equal(firstSchedule.data?.[0]?.alert_count, 1);
    assert.equal(secondSchedule.data?.[0]?.alert_count, 0);
    assert.equal((await service.from("quote_expiration_alerts").select("id", { count: "exact", head: true }).eq("approval_token_id", activeJob.approval_token_id)).count, 1);

    const expired = await service.rpc("schedule_quote_lifecycle", { p_now: expiry! });
    assert.equal(expired.data?.[0]?.expired_count, 1);
    assert.equal((await service.from("quotes").select("status").eq("id", quoteId).single()).data?.status, "expired");

    const reissuedArgs = enqueueArgs(versionId, "new encrypted generation");
    const reissued = await admin.rpc("enqueue_quote_email_delivery", reissuedArgs);
    assert.equal(reissued.data?.[0]?.result, "created");
    const reissuedJob = reissued.data?.[0]?.delivery;
    assert.equal(reissuedJob?.generation, 2);
    assert.notEqual(reissuedJob?.approval_token_id, activeJob.approval_token_id);

    for (const minute of [1, 2, 4]) {
      const now = `2026-09-15T03:0${minute}:00.000Z`;
      const claim = await service.rpc("claim_quote_email_deliveries", { p_worker_id: "integration", p_limit: 20, p_now: now });
      assert.equal(claim.data?.some((row) => row.id === reissuedJob?.id), true);
      const failed = await service.rpc("fail_quote_email_delivery", { p_job_id: reissuedJob!.id, p_error_code: "SAFE_ERROR", p_now: now });
      assert.equal(failed.error, null, failed.error?.message);
    }
    const retry = await admin.rpc("retry_quote_email_delivery", { p_job_id: reissuedJob!.id, p_now: "2026-09-15T04:00:00.000Z" });
    assert.equal(retry.data?.[0]?.result, "requeued");
    assert.equal(retry.data?.[0]?.delivery.id, reissuedJob?.id);
    assert.equal(retry.data?.[0]?.delivery.approval_token_id, reissuedJob?.approval_token_id);

    const rollback = enqueueArgs(versionId, "rollback");
    rollback.p_payload_nonce = "";
    await service.from("quote_email_deliveries").update({ superseded_at: "2026-09-15T05:00:00.000Z" }).eq("id", reissuedJob!.id);
    await service.from("quote_approval_tokens").update({ revoked_at: "2026-09-15T05:00:00.000Z" }).eq("id", reissuedJob!.approval_token_id);
    const invalid = await admin.rpc("enqueue_quote_email_delivery", rollback);
    assert.notEqual(invalid.error, null);
    assert.equal((await service.from("quote_approval_tokens").select("id", { count: "exact", head: true }).eq("id", rollback.p_token_id)).count, 0);
  });
});

function enqueueArgs(versionId: string, ciphertext: string) {
  const token = createApprovalToken();
  return {
    p_job_id: randomUUID(), p_quote_version_id: versionId, p_token_id: randomUUID(), p_token_hash: token.tokenHash,
    p_encrypted_payload: Buffer.from(ciphertext).toString("base64"), p_payload_nonce: Buffer.alloc(12, 1).toString("base64"),
    p_payload_auth_tag: Buffer.alloc(16, 2).toString("base64"), p_now: "2026-09-07T02:59:00.000Z",
  };
}

function snapshotArgs() {
  return {
    p_title: "이메일 견적", p_body: "통합 테스트 본문", p_scope_items: ["기획", "제작"], p_total_amount: 1_000_000,
    p_estimated_start_date: "2026-09-10", p_estimated_end_date: "2026-10-10", p_deposit_amount: 300_000,
    p_balance_amount: 700_000, p_deposit_terms: "진행 전 입금", p_balance_terms: "검수 후 입금",
  };
}
