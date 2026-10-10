import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/shared/types/database.generated";

const enabled = process.env.RUN_ADMIN_WORK_ITEMS_INTEGRATION === "1";

describe("로컬 관리자 오늘 할 일 PostgreSQL 통합", { skip: !enabled }, () => {
  test("자격·우선순위·대기 시각·배송 상태·페이지네이션을 한 snapshot으로 집계한다", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(url && anonKey && serviceKey);
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "로컬 Supabase에서만 실행할 수 있습니다.");

    const service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
    const login = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const email = `work-items-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}!`;
    const createdUser = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(createdUser.error, null, createdUser.error?.message);
    const userId = createdUser.data.user.id;
    const adminRow = await service.from("admins").insert({ id: userId, email }).select("id").single();
    assert.equal(adminRow.error, null, adminRow.error?.message);
    const signedIn = await login.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, signedIn.error?.message);
    const admin = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
    });

    const inquiryIds: string[] = [];
    const quoteIds: string[] = [];
    const versionIds: string[] = [];
    const tokenIds: string[] = [];
    const projectIds: string[] = [];
    const customerIds: string[] = [];
    const paymentIds: string[] = [];
    const deliveryIds: string[] = [];
    const fixedNow = "2026-10-10T00:00:00.000Z";

    try {
      const createInquiry = async (status: Database["public"]["Enums"]["inquiry_status"], name: string) => {
        const result = await service.from("inquiries").insert({
          customer_name: name, email: `${randomUUID()}@local.test`, service_type: "아임웹 제작",
          message: "관리자 업무 집계 통합 테스트 문의", source: "integration_test", status,
        }).select("id").single();
        assert.equal(result.error, null, result.error?.message);
        inquiryIds.push(result.data.id);
        return result.data.id;
      };
      const newInquiryId = await createInquiry("new", "신규 문의");
      const qualifiedInquiryId = await createInquiry("qualified", "견적 작성 문의");
      const legacyQualifiedId = await createInquiry("qualified", "기존 qualified 문의");
      assert.equal((await service.from("inquiries").update({ qualified_at: null }).eq("id", legacyQualifiedId)).error, null);

      const qualifiedAt = (await service.from("inquiries").select("qualified_at").eq("id", qualifiedInquiryId).single()).data?.qualified_at;
      assert.ok(qualifiedAt);
      assert.equal((await service.from("inquiries").update({ admin_notes: "same status" }).eq("id", qualifiedInquiryId)).error, null);
      assert.equal((await service.from("inquiries").select("qualified_at").eq("id", qualifiedInquiryId).single()).data?.qualified_at, qualifiedAt);
      assert.equal((await service.from("inquiries").update({ status: "contacted" }).eq("id", qualifiedInquiryId)).error, null);
      assert.equal((await service.from("inquiries").update({ status: "qualified" }).eq("id", qualifiedInquiryId)).error, null);
      const requalifiedAt = (await service.from("inquiries").select("qualified_at").eq("id", qualifiedInquiryId).single()).data?.qualified_at;
      assert.ok(requalifiedAt && requalifiedAt !== qualifiedAt);

      const createQuote = async (inquiryId: string, title: string) => {
        const result = await admin.rpc("create_quote_with_version", {
          p_inquiry_id: inquiryId, p_title: title, p_body: "업무 집계 테스트 견적",
          p_scope_items: ["기획"], p_total_amount: 1000000,
          p_estimated_start_date: "2026-10-15", p_estimated_end_date: "2026-11-15",
          p_deposit_amount: 300000, p_balance_amount: 700000,
          p_deposit_terms: "계약 시", p_balance_terms: "완료 시",
        });
        assert.equal(result.error, null, result.error?.message);
        const row = result.data?.[0];
        assert.ok(row?.created_quote_id && row.created_quote_version_id);
        quoteIds.push(row.created_quote_id);
        versionIds.push(row.created_quote_version_id);
        return { quoteId: row.created_quote_id, versionId: row.created_quote_version_id };
      };

      const conversionInquiryId = await createInquiry("qualified", "승인 전환 문의");
      const conversion = await createQuote(conversionInquiryId, "승인 전환 견적");
      const approvalTokenId = randomUUID();
      tokenIds.push(approvalTokenId);
      assert.equal((await service.from("quote_approval_tokens").insert({
        id: approvalTokenId, quote_version_id: conversion.versionId, token_hash: randomHash(),
        expires_at: null, created_by: userId,
      })).error, null);
      assert.equal((await service.from("quote_approvals").insert({
        quote_id: conversion.quoteId, quote_version_id: conversion.versionId, approval_token_id: approvalTokenId,
      })).error, null);
      assert.equal((await service.from("quotes").update({ status: "approved", approved_version_id: conversion.versionId }).eq("id", conversion.quoteId)).error, null);

      const sendInquiryId = await createInquiry("contacted", "발송 대상 문의");
      const send = await createQuote(sendInquiryId, "발송 대상 견적");
      const queuedToken = randomUUID();
      const queuedDelivery = randomUUID();
      tokenIds.push(queuedToken); deliveryIds.push(queuedDelivery);
      assert.equal((await service.from("quote_approval_tokens").insert({ id: queuedToken, quote_version_id: send.versionId, token_hash: randomHash(), expires_at: null, created_by: userId })).error, null);
      assert.equal((await service.from("quote_email_deliveries").insert({ id: queuedDelivery, quote_id: send.quoteId, quote_version_id: send.versionId, approval_token_id: queuedToken, generation: 1, encrypted_payload: "encrypted", payload_nonce: "nonce", payload_auth_tag: "tag", status: "queued" })).error, null);

      const retryInquiryId = await createInquiry("contacted", "재시도 발송 문의");
      const retry = await createQuote(retryInquiryId, "재시도 견적");
      const failedToken = randomUUID();
      const failedDelivery = randomUUID();
      tokenIds.push(failedToken); deliveryIds.push(failedDelivery);
      assert.equal((await service.from("quote_approval_tokens").insert({ id: failedToken, quote_version_id: retry.versionId, token_hash: randomHash(), expires_at: null, created_by: userId })).error, null);
      assert.equal((await service.from("quote_email_deliveries").insert({ id: failedDelivery, quote_id: retry.quoteId, quote_version_id: retry.versionId, approval_token_id: failedToken, generation: 1, encrypted_payload: "encrypted", payload_nonce: "nonce", payload_auth_tag: "tag", status: "failed", attempt_count: 1, max_attempts: 3 })).error, null);

      const customer = await service.from("customers").insert({ name: "연체 고객" }).select("id").single();
      assert.equal(customer.error, null, customer.error?.message);
      customerIds.push(customer.data.id);
      const project = await service.from("projects").insert({ customer_id: customer.data.id, name: "연체 프로젝트", contract_amount: 1000000 }).select("id").single();
      assert.equal(project.error, null, project.error?.message);
      projectIds.push(project.data.id);
      const payment = await service.from("payments").insert({ project_id: project.data.id, kind: "balance", amount: 1000000, due_date: "2026-10-08" }).select("id").single();
      assert.equal(payment.error, null, payment.error?.message);
      paymentIds.push(payment.data.id);
      assert.equal((await service.from("payment_receipts").insert({ payment_id: payment.data.id, amount: 300000, idempotency_key: randomUUID() })).error, null);

      const all = await admin.rpc("get_admin_work_items", { p_page: 1, p_page_size: 25, p_group: "all", p_now: fixedNow });
      assert.equal(all.error, null, all.error?.message);
      const payload = all.data as { counts: Record<string, number>; items: Array<Record<string, unknown>>; pagination: { total: number } };
      assert.equal(payload.counts.newInquiry, 1);
      assert.equal(payload.counts.projectConversion, 1);
      assert.equal(payload.counts.overduePayment, 1);
      assert.equal(payload.counts.quote, 3);
      assert.deepEqual(payload.items.slice(0, 6).map((item) => item.priority), [10, 20, 30, 40, 40, 41]);
      assert.equal(payload.items.some((item) => item.customerName === "기존 qualified 문의"), true);
      assert.equal(payload.items.some((item) => item.waitingSinceFallback === true), true);
      assert.equal(payload.items.some((item) => item.deliveryStatus === "queued"), false);
      assert.equal(payload.items.some((item) => item.deliveryStatus === "failed"), true);
      assert.equal(payload.pagination.total, 6);

      const page = await admin.rpc("get_admin_work_items", { p_page: 2, p_page_size: 2, p_group: "all", p_now: fixedNow });
      assert.equal(page.error, null, page.error?.message);
      const pagePayload = page.data as { items: unknown[]; pagination: { total: number; hasNextPage: boolean } };
      assert.equal(pagePayload.items.length, 2);
      assert.equal(pagePayload.pagination.total, 6);
      assert.equal(pagePayload.pagination.hasNextPage, true);

      const nonAdmin = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
      const denied = await nonAdmin.rpc("get_admin_work_items", { p_page: 1, p_page_size: 25, p_group: "all", p_now: fixedNow });
      assert.equal(denied.error?.code, "42501");
      assert.equal(newInquiryId.length, 36);
    } finally {
      if (deliveryIds.length) await service.from("quote_email_deliveries").delete().in("id", deliveryIds);
      if (tokenIds.length) await service.from("quote_approvals").delete().in("approval_token_id", tokenIds);
      if (tokenIds.length) await service.from("quote_approval_tokens").delete().in("id", tokenIds);
      if (paymentIds.length) await service.from("payment_receipts").delete().in("payment_id", paymentIds);
      if (paymentIds.length) await service.from("payments").delete().in("id", paymentIds);
      if (projectIds.length) await service.from("projects").delete().in("id", projectIds);
      if (customerIds.length) await service.from("customers").delete().in("id", customerIds);
      if (quoteIds.length) await service.from("quote_versions").delete().in("quote_id", quoteIds);
      if (quoteIds.length) await service.from("quotes").delete().in("id", quoteIds);
      if (inquiryIds.length) await service.from("inquiries").delete().in("id", inquiryIds);
      await service.from("admins").delete().eq("id", userId);
      await service.auth.admin.deleteUser(userId);
    }
  });
});

function randomHash() {
  return randomUUID().replaceAll("-", "").repeat(2);
}
