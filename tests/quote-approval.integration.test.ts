import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

import { createApprovalToken } from "../src/entities/quote/server/token";
import type { Database } from "../src/shared/types/database.generated";

const enabled = process.env.RUN_QUOTE_INTEGRATION_TESTS === "1";

describe("로컬 견적 승인 PostgreSQL 통합", { skip: !enabled }, () => {
  test("RLS·버전 잠금·토큰 교체·만료·동시 승인을 원자적으로 보장한다", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(url && anonKey && serviceKey);
    assert.ok(
      ["127.0.0.1", "localhost"].includes(new URL(url).hostname),
      "통합 테스트는 로컬 Supabase에서만 실행할 수 있습니다.",
    );

    const service = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false },
    });
    const anon = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
    });
    const login = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
    });

    const email = `quote-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}!`;
    const createdUser = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.equal(createdUser.error, null, createdUser.error?.message);
    const userId = createdUser.data.user.id;
    assert.equal(
      (await service.from("admins").insert({ id: userId, email })).error,
      null,
    );
    const signedIn = await login.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, signedIn.error?.message);
    const admin = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${signedIn.data.session.access_token}`,
        },
      },
    });

    const inquiry = await service
      .from("inquiries")
      .insert({
        customer_name: "로컬 견적 고객",
        service_type: "아임웹 제작",
        message: "로컬 견적 승인 통합 테스트 문의입니다.",
        source: "integration_test",
      })
      .select("id")
      .single();
    assert.equal(inquiry.error, null, inquiry.error?.message);

    const anonTableRead = await anon.from("quotes").select("id");
    assert.equal(anonTableRead.error?.code, "42501");

    const createdQuote = await admin.rpc("create_quote_with_version", {
      p_inquiry_id: inquiry.data.id,
      ...snapshotArgs("초기 견적"),
    });
    assert.equal(createdQuote.error, null, createdQuote.error?.message);
    const quoteId = createdQuote.data?.[0]?.created_quote_id;
    const versionOneId = createdQuote.data?.[0]?.created_quote_version_id;
    assert.ok(quoteId && versionOneId);

    const directAdminWrite = await admin
      .from("quote_versions")
      .update({ title: "변조" })
      .eq("id", versionOneId);
    assert.equal(directAdminWrite.error?.code, "42501");
    const serviceMutation = await service
      .from("quote_versions")
      .update({ title: "변조" })
      .eq("id", versionOneId);
    assert.equal(serviceMutation.error?.code, "55000");

    const firstToken = createApprovalToken();
    const firstIssueStartedAt = Date.now();
    const firstIssue = await admin.rpc("issue_quote_approval_token", {
      p_quote_version_id: versionOneId,
      p_token_hash: firstToken.tokenHash,
    });
    assert.equal(firstIssue.error, null, firstIssue.error?.message);
    const firstExpiry = Date.parse(firstIssue.data?.[0]?.issued_expires_at ?? "");
    assert.ok(firstExpiry - firstIssueStartedAt >= 7 * 24 * 60 * 60 * 1000 - 5_000);
    assert.ok(firstExpiry - firstIssueStartedAt <= 7 * 24 * 60 * 60 * 1000 + 5_000);
    assert.equal(
      (await service.from("quotes").update({ status: "sent" }).eq("id", quoteId)).error,
      null,
    );

    const firstPublicRead = await anon.rpc("get_public_quote_by_token", {
      p_token_hash: firstToken.tokenHash,
    });
    assert.equal(firstPublicRead.error, null, firstPublicRead.error?.message);
    assert.equal(firstPublicRead.data?.[0]?.availability, "available");
    assert.equal(firstPublicRead.data?.[0]?.customer_name, "로컬 견적 고객");

    const revoked = await admin.rpc("revoke_quote_approval_token", {
      p_quote_version_id: versionOneId,
    });
    assert.equal(revoked.error, null, revoked.error?.message);
    assert.equal(revoked.data?.[0]?.was_revoked, true);
    const revokedRead = await anon.rpc("get_public_quote_by_token", {
      p_token_hash: firstToken.tokenHash,
    });
    assert.equal(revokedRead.data?.[0]?.availability, "unavailable");

    const secondToken = createApprovalToken();
    const secondIssue = await admin.rpc("issue_quote_approval_token", {
      p_quote_version_id: versionOneId,
      p_token_hash: secondToken.tokenHash,
    });
    assert.equal(secondIssue.error, null, secondIssue.error?.message);
    const replacedRead = await anon.rpc("get_public_quote_by_token", {
      p_token_hash: firstToken.tokenHash,
    });
    assert.equal(replacedRead.data?.[0]?.availability, "unavailable");
    assert.equal(replacedRead.data?.[0]?.customer_name, null);

    const approvals = await Promise.all([
      anon.rpc("approve_quote_by_token", {
        p_token_hash: secondToken.tokenHash,
        p_client_ip: "203.0.113.10",
        p_user_agent: "integration-a",
      }),
      anon.rpc("approve_quote_by_token", {
        p_token_hash: secondToken.tokenHash,
        p_client_ip: "203.0.113.11",
        p_user_agent: "integration-b",
      }),
    ]);
    for (const approval of approvals) {
      assert.equal(approval.error, null, approval.error?.message);
    }
    assert.deepEqual(
      approvals.map((approval) => approval.data?.[0]?.result).sort(),
      ["approved", "unavailable"],
    );
    const approvalCount = await service
      .from("quote_approvals")
      .select("id", { count: "exact", head: true })
      .eq("quote_version_id", versionOneId);
    assert.equal(approvalCount.count, 1);

    const versionTwo = await admin.rpc("create_quote_version", {
      p_quote_id: quoteId,
      ...snapshotArgs("승인 후 변경 견적"),
    });
    assert.equal(versionTwo.error, null, versionTwo.error?.message);
    assert.equal(versionTwo.data?.[0]?.created_version_number, 2);
    const versionTwoId = versionTwo.data?.[0]?.created_quote_version_id;
    assert.ok(versionTwoId);
    const quoteAfterVersion = await service
      .from("quotes")
      .select("status,approved_version_id")
      .eq("id", quoteId)
      .single();
    assert.deepEqual(quoteAfterVersion.data, {
      status: "draft",
      approved_version_id: null,
    });
    assert.equal(approvalCount.count, 1);

    const expiringToken = createApprovalToken();
    const expiringIssue = await admin.rpc("issue_quote_approval_token", {
      p_quote_version_id: versionTwoId,
      p_token_hash: expiringToken.tokenHash,
    });
    assert.equal(expiringIssue.error, null, expiringIssue.error?.message);
    assert.equal(
      (await service.from("quotes").update({ status: "sent" }).eq("id", quoteId)).error,
      null,
    );
    assert.equal(
      (
        await service
          .from("quote_approval_tokens")
          .update({
            created_at: "1999-12-25T00:00:00Z",
            expires_at: "2000-01-01T00:00:00Z",
          })
          .eq("token_hash", expiringToken.tokenHash)
      ).error,
      null,
    );
    const expiredRead = await anon.rpc("get_public_quote_by_token", {
      p_token_hash: expiringToken.tokenHash,
    });
    assert.equal(expiredRead.data?.[0]?.availability, "expired");
    const expiredApproval = await anon.rpc("approve_quote_by_token", {
      p_token_hash: expiringToken.tokenHash,
    });
    assert.equal(expiredApproval.data?.[0]?.result, "expired");

    const finalToken = createApprovalToken();
    assert.equal(
      (
        await admin.rpc("issue_quote_approval_token", {
          p_quote_version_id: versionTwoId,
          p_token_hash: finalToken.tokenHash,
        })
      ).error,
      null,
    );
    assert.equal(
      (await admin.rpc("cancel_quote", { p_quote_id: quoteId })).error,
      null,
    );
    const cancelledApproval = await anon.rpc("approve_quote_by_token", {
      p_token_hash: finalToken.tokenHash,
    });
    assert.equal(cancelledApproval.data?.[0]?.result, "unavailable");
  });
});

function snapshotArgs(title: string) {
  return {
    p_title: title,
    p_body: "반응형 사이트 제작과 운영 인계를 포함합니다.",
    p_scope_items: ["기획", "제작", "운영 인계"],
    p_total_amount: 1_000_000,
    p_estimated_start_date: "2026-09-10",
    p_estimated_end_date: "2026-10-10",
    p_deposit_amount: 300_000,
    p_balance_amount: 700_000,
    p_deposit_terms: "진행 전 입금",
    p_balance_terms: "검수 후 입금",
  };
}
