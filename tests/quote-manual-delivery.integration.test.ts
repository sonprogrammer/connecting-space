import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, test } from "node:test";

import { createClient } from "@supabase/supabase-js";

import { createApprovalToken } from "../src/entities/quote/server/token";

const enabled = process.env.RUN_QUOTE_MANUAL_INTEGRATION_TESTS === "1";

describe("로컬 견적 PDF 수동 발급 PostgreSQL 통합", { skip: !enabled }, () => {
  test("RLS·멱등 발급·충돌·재발급·7일 만료·공개 승인을 원자적으로 보장한다", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(url && anonKey && serviceKey);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(new URL(url).hostname),
      "통합 테스트는 로컬 Supabase에서만 실행할 수 있습니다.",
    );

    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const login = createClient(url, anonKey, { auth: { persistSession: false } });
    const email = `manual-quote-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}!`;
    const createdUser = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(createdUser.error, null, createdUser.error?.message);
    const userId = createdUser.data.user.id;
    assert.equal((await service.from("admins").insert({ id: userId, email })).error, null);
    const signedIn = await login.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, signedIn.error?.message);
    const admin = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
    });

    const inquiry = await service.from("inquiries").insert({
      customer_name: "수동 발급 고객",
      service_type: "아임웹 제작",
      message: "수동 PDF 발급 통합 테스트 문의입니다.",
      source: "integration_test",
    }).select("id").single();
    assert.equal(inquiry.error, null, inquiry.error?.message);
    const createdQuote = await admin.rpc("create_quote_with_version", {
      p_inquiry_id: inquiry.data.id,
      ...snapshotArgs(),
    });
    assert.equal(createdQuote.error, null, createdQuote.error?.message);
    const quoteId = createdQuote.data?.[0]?.created_quote_id as string;
    const versionId = createdQuote.data?.[0]?.created_quote_version_id as string;
    assert.ok(quoteId && versionId);

    const denied = await anon.from("quote_manual_deliveries").select("id");
    assert.equal(denied.error?.code, "42501");

    const issuedAt = new Date();
    const firstToken = createApprovalToken();
    const firstArgs = issueArgs(versionId, firstToken.tokenHash, issuedAt);
    const [first, concurrentDuplicate] = await Promise.all([
      admin.rpc("issue_quote_manual_delivery", firstArgs),
      admin.rpc("issue_quote_manual_delivery", {
        ...firstArgs,
        p_delivery_id: randomUUID(),
        p_token_id: randomUUID(),
      }),
    ]);
    assert.equal(first.error, null, first.error?.message);
    assert.equal(concurrentDuplicate.error, null, concurrentDuplicate.error?.message);
    assert.deepEqual(
      [first.data?.[0]?.result, concurrentDuplicate.data?.[0]?.result].sort(),
      ["created", "existing"],
    );
    const firstDelivery = [first, concurrentDuplicate]
      .find((response) => response.data?.[0]?.result === "created")?.data?.[0]?.delivery;
    assert.ok(firstDelivery?.id);
    assert.equal(
      Date.parse(firstDelivery.expires_at) - Date.parse(firstDelivery.issued_at),
      7 * 24 * 60 * 60 * 1000,
    );
    const quoteAfterIssue = await service.from("quotes")
      .select("status,delivery_method").eq("id", quoteId).single();
    assert.deepEqual(quoteAfterIssue.data, { status: "sent", delivery_method: "manual" });

    const duplicate = await admin.rpc("issue_quote_manual_delivery", {
      ...firstArgs,
      p_delivery_id: randomUUID(),
      p_token_id: randomUUID(),
    });
    assert.equal(duplicate.error, null, duplicate.error?.message);
    assert.equal(duplicate.data?.[0]?.result, "existing");
    assert.equal(duplicate.data?.[0]?.delivery.id, firstDelivery.id);
    assert.equal(
      (await service.from("quote_manual_deliveries").select("id", { count: "exact", head: true })
        .eq("quote_version_id", versionId)).count,
      1,
    );

    const secondToken = createApprovalToken();
    const secondArgs = issueArgs(versionId, secondToken.tokenHash, new Date(), true);
    const withoutReissue = await admin.rpc("issue_quote_manual_delivery", {
      ...secondArgs,
      p_reissue: false,
    });
    assert.equal(withoutReissue.error?.code, "P0001");

    const reissued = await admin.rpc("issue_quote_manual_delivery", secondArgs);
    assert.equal(reissued.error, null, reissued.error?.message);
    assert.equal(reissued.data?.[0]?.result, "created");
    assert.equal(reissued.data?.[0]?.delivery.generation, 2);
    const oldToken = await service.from("quote_approval_tokens")
      .select("revoked_at,replaced_by_id").eq("token_hash", firstToken.tokenHash).single();
    assert.ok(oldToken.data?.revoked_at);
    assert.equal(oldToken.data?.replaced_by_id, reissued.data?.[0]?.delivery.approval_token_id);
    assert.ok(
      (await service.from("quote_manual_deliveries").select("superseded_at")
        .eq("id", firstDelivery.id).single()).data?.superseded_at,
    );

    const oldRead = await anon.rpc("get_public_quote_by_token", { p_token_hash: firstToken.tokenHash });
    const currentRead = await anon.rpc("get_public_quote_by_token", { p_token_hash: secondToken.tokenHash });
    assert.equal(oldRead.data?.[0]?.availability, "unavailable");
    assert.equal(currentRead.data?.[0]?.availability, "available");
    const approved = await anon.rpc("approve_quote_by_token", { p_token_hash: secondToken.tokenHash });
    assert.equal(approved.data?.[0]?.result, "approved");
    assert.ok(
      (await service.from("quote_manual_deliveries").select("superseded_at")
        .eq("id", reissued.data?.[0]?.delivery.id).single()).data?.superseded_at,
    );
  });
});

function issueArgs(versionId: string, tokenHash: string, issuedAt: Date, reissue = false) {
  const idempotencyKey = randomUUID();
  return {
    p_delivery_id: randomUUID(),
    p_quote_version_id: versionId,
    p_token_id: randomUUID(),
    p_token_hash: tokenHash,
    p_idempotency_key_hash: createHash("sha256").update(idempotencyKey).digest("hex"),
    p_reissue: reissue,
    p_issued_at: issuedAt.toISOString(),
  };
}

function snapshotArgs() {
  return {
    p_title: "수동 발급 견적",
    p_body: "PDF에 들어갈 불변 견적 본문",
    p_scope_items: ["기획", "개발"],
    p_total_amount: 1_000_000,
    p_estimated_start_date: "2026-09-10",
    p_estimated_end_date: "2026-10-10",
    p_deposit_amount: 300_000,
    p_balance_amount: 700_000,
    p_deposit_terms: "착수 전",
    p_balance_terms: "검수 후",
  };
}
