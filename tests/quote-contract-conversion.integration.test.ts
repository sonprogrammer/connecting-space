import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/shared/types/database.generated";

const enabled = process.env.RUN_QUOTE_CONTRACT_INTEGRATION_TESTS === "1";
type LocalClient = SupabaseClient<Database>;

describe("로컬 서명 확인 전환 PostgreSQL 통합", { skip: !enabled }, () => {
  test("승인 전 차단부터 전환·동시성·rollback·RLS까지 독립 fixture로 검증한다", async () => {
    const env = readLocalSupabaseEnv();
    const host = new URL(env.url).hostname;
    assert.ok(host === "localhost" || host === "127.0.0.1", "integration test requires local Supabase");
    const service = createClient<Database>(env.url, env.serviceKey);
    const authEmail = `issue-61-${randomUUID()}@local.test`;
    const authPassword = `Local-${randomUUID()}!`;
    const createdUser = await service.auth.admin.createUser({ email: authEmail, password: authPassword, email_confirm: true });
    assert.equal(createdUser.error, null, createdUser.error?.message);
    const adminId = createdUser.data.user?.id;
    assert.ok(adminId);
    assert.equal((await service.from("admins").insert({ id: adminId, email: authEmail, display_name: "Issue 61 Test" })).error, null);
    const admin = createClient<Database>(env.url, env.anonKey);
    const session = await admin.auth.signInWithPassword({ email: authEmail, password: authPassword });
    assert.equal(session.error, null, session.error?.message);
    const client = createClient<Database>(env.url, env.anonKey, { global: { headers: { Authorization: `Bearer ${session.data.session?.access_token}` } } });
    const fixtures: string[] = [];
    try {
      const approved = await createFixture(service, adminId, { total: 101, status: "approved", delivery: true });
      fixtures.push(approved.inquiryId);
      const pending = await createFixture(service, adminId, { total: 100, status: "sent", delivery: true });
      fixtures.push(pending.inquiryId);
      const undelivered = await createFixture(service, adminId, { total: 100, status: "approved", delivery: false });
      fixtures.push(undelivered.inquiryId);
      const expired = await createFixture(service, adminId, { total: 100, status: "expired", delivery: true });
      fixtures.push(expired.inquiryId);
      const rollback = await createFixture(service, adminId, { total: 100, status: "approved", delivery: true, wrongDeposit: true });
      fixtures.push(rollback.inquiryId);
      const concurrentFixture = await createFixture(service, adminId, { total: 203, status: "approved", delivery: true });
      fixtures.push(concurrentFixture.inquiryId);
      const overrideFixture = await createFixture(service, adminId, { total: 100, status: "approved", delivery: true });
      fixtures.push(overrideFixture.inquiryId);

      const base = { p_quote_version_id: approved.versionId, p_confirmed_at: "2026-09-12T10:00:00+09:00", p_deposit_percentage: 30, p_balance_percentage: 70 };
      const blocked = await client.rpc("confirm_quote_contract", { ...base, p_quote_version_id: pending.versionId, p_confirmation_id: randomUUID(), p_idempotency_key_hash: "1".repeat(64) });
      assert.equal(blocked.error?.code, "P0001");
      assert.equal((await service.from("quote_contract_confirmations").select("id").eq("quote_version_id", pending.versionId)).data?.length, 0);

      const created = await client.rpc("confirm_quote_contract", { ...base, p_confirmation_id: randomUUID(), p_idempotency_key_hash: "2".repeat(64) });
      assert.equal(created.error, null, created.error?.message);
      assert.equal(created.data?.[0]?.result, "created");
      const confirmation = created.data?.[0]?.confirmation;
      assert.ok(confirmation?.project_id && confirmation.deposit_payment_id && confirmation.balance_payment_id);
      const payments = await service.from("payments").select("kind,amount,due_date").eq("project_id", confirmation.project_id).order("kind");
      assert.equal(payments.error, null);
      assert.deepEqual(payments.data?.map((row) => [row.kind, row.amount, row.due_date]), [["balance", 71, "2026-10-01"], ["deposit", 30, "2026-09-12"]]);

      const retry = await client.rpc("confirm_quote_contract", { ...base, p_confirmation_id: randomUUID(), p_idempotency_key_hash: "2".repeat(64) });
      assert.equal(retry.error, null, retry.error?.message);
      assert.equal(retry.data?.[0]?.result, "existing");
      const concurrent = await Promise.all(["3", "4"].map((key) => client.rpc("confirm_quote_contract", { ...base, p_quote_version_id: concurrentFixture.versionId, p_confirmation_id: randomUUID(), p_idempotency_key_hash: key.repeat(64) })));
      assert.equal(concurrent.filter((result) => result.data?.[0]?.result === "created").length, 1);
      assert.equal(concurrent.filter((result) => result.error?.code === "P0001").length, 1);

      for (const fixture of [undelivered, expired]) {
        const result = await client.rpc("confirm_quote_contract", { ...base, p_quote_version_id: fixture.versionId, p_confirmation_id: randomUUID(), p_idempotency_key_hash: randomUUID().replaceAll("-", "").padEnd(64, "0") });
        assert.equal(result.error?.code, "P0001");
      }
      const override = await client.rpc("confirm_quote_contract", { ...base, p_quote_version_id: overrideFixture.versionId, p_confirmation_id: randomUUID(), p_idempotency_key_hash: "5".repeat(64), p_deposit_percentage: 25, p_balance_percentage: 75, p_deposit_amount: 25, p_balance_amount: 75, p_deposit_due_date: "2026-09-20", p_balance_due_date: "2026-10-20" });
      assert.equal(override.error, null, override.error?.message);
      const overrideProjectId = override.data?.[0]?.confirmation?.project_id;
      assert.ok(overrideProjectId);
      const overridePayments = await service.from("payments").select("kind,amount,due_date").eq("project_id", overrideProjectId).order("kind");
      assert.deepEqual(overridePayments.data?.map((row) => [row.kind, row.amount, row.due_date]), [["balance", 75, "2026-10-20"], ["deposit", 25, "2026-09-20"]]);
      const failed = await client.rpc("confirm_quote_contract", { ...base, p_quote_version_id: rollback.versionId, p_confirmation_id: randomUUID(), p_idempotency_key_hash: "6".repeat(64) });
      assert.equal(failed.error?.code, "P0001");
      assert.equal((await service.from("quote_contract_confirmations").select("id").eq("quote_version_id", rollback.versionId)).data?.length, 0);
      const rollbackProject = await service.from("projects").select("id").eq("inquiry_id", rollback.inquiryId).single();
      assert.equal(rollbackProject.error, null);
      const rollbackPayments = await service.from("payments").select("kind,amount").eq("project_id", rollbackProject.data.id);
      assert.deepEqual(rollbackPayments.data, [{ kind: "deposit", amount: 1 }]);
      const anon = createClient<Database>(env.url, env.anonKey);
      const anonRead = await anon.from("quote_contract_confirmations").select("id").eq("quote_version_id", approved.versionId);
      assert.ok(anonRead.error || anonRead.data?.length === 0);
      const adminRead = await client.from("quote_contract_confirmations").select("id").eq("quote_version_id", approved.versionId);
      assert.equal(adminRead.error, null);
      assert.equal(adminRead.data?.length, 1);
    } finally {
      for (const inquiryId of fixtures) await cleanupFixture(service, inquiryId);
      await service.from("admins").delete().eq("id", adminId);
      await service.auth.admin.deleteUser(adminId);
    }
  });
});

function readLocalSupabaseEnv() {
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  const values = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^['\"]|['\"]$/g, "")]] : [];
  }));
  const url = values.API_URL ?? values.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = values.ANON_KEY ?? values.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = values.SERVICE_ROLE_KEY ?? values.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && anonKey && serviceKey, "supabase status -o env must expose local API keys");
  return { url, anonKey, serviceKey };
}

async function createFixture(service: LocalClient, adminId: string, options: { total: number; status: "approved" | "sent" | "expired"; delivery: boolean; wrongDeposit?: boolean }) {
  const inquiryId = randomUUID();
  const quoteId = randomUUID();
  const versionId = randomUUID();
  const tokenId = randomUUID();
  const now = new Date().toISOString();
  try {
    // quote_versions가 아직 없으므로 먼저 approved_version_id 없이 quote를 만든다.
    assert.equal((await service.from("inquiries").insert({ id: inquiryId, customer_name: "Issue 61 Test", email: `fixture-${inquiryId}@local.test`, service_type: "web", message: "fixture" })).error, null);
    assert.equal((await service.from("quotes").insert({ id: quoteId, inquiry_id: inquiryId, status: options.status, created_by: adminId })).error, null);
    assert.equal((await service.from("quote_versions").insert({ id: versionId, quote_id: quoteId, version_number: 1, title: "Issue 61 fixture", body: "fixture body", scope_items: ["fixture"], total_amount: options.total, estimated_start_date: "2026-09-12", estimated_end_date: "2026-10-01", deposit_amount: Math.floor(options.total * .3), balance_amount: options.total - Math.floor(options.total * .3), deposit_terms: "30%", balance_terms: "70%", created_by: adminId })).error, null);
    const quoteUpdate = { latest_version_id: versionId, ...(options.status === "approved" ? { approved_version_id: versionId } : {}) };
    assert.equal((await service.from("quotes").update(quoteUpdate).eq("id", quoteId)).error, null);
  if (options.status === "approved") {
    assert.equal((await service.from("quote_approval_tokens").insert({ id: tokenId, quote_version_id: versionId, token_hash: `${tokenId.replaceAll("-", "")}0000000000000000000000000000000000000000000000000000`.slice(0, 64), expires_at: new Date(Date.now() + 86400000).toISOString(), created_by: adminId })).error, null);
    assert.equal((await service.from("quote_approvals").insert({ quote_id: quoteId, quote_version_id: versionId, approval_token_id: tokenId })).error, null);
  }
  if (options.delivery) {
    if (options.status === "approved") {
      const issuedAt = new Date(now);
      assert.equal((await service.from("quote_manual_deliveries").insert({ id: randomUUID(), quote_id: quoteId, quote_version_id: versionId, approval_token_id: tokenId, generation: 1, idempotency_key_hash: `${quoteId.replaceAll("-", "")}0000000000000000000000000000000000000000000000000000`.slice(0, 64), issued_at: now, expires_at: new Date(issuedAt.getTime() + 7 * 86400000).toISOString(), created_by: adminId })).error, null);
    }
  }
  if (options.wrongDeposit) {
    const customer = await service.from("customers").insert({ inquiry_id: inquiryId, name: "rollback" }).select("id").single();
    assert.equal(customer.error, null);
    const project = await service.from("projects").insert({ inquiry_id: inquiryId, customer_id: customer.data.id, name: "rollback", contract_amount: options.total }).select("id").single();
    assert.equal(project.error, null);
    assert.equal((await service.from("payments").insert({ project_id: project.data.id, kind: "deposit", amount: 1, due_date: "2026-09-12" })).error, null);
  }
    return { inquiryId, versionId };
  } catch (error) {
    // 단계 중간 실패에도 이미 생성된 inquiry/quote/version 및 부속 row를 정리한다.
    await cleanupFixture(service, inquiryId);
    throw error;
  }
}

async function cleanupFixture(service: LocalClient, inquiryId: string) {
  const { data: inquiry } = await service.from("inquiries").select("converted_customer_id,converted_project_id").eq("id", inquiryId).maybeSingle();
  const { data: quotes } = await service.from("quotes").select("id").eq("inquiry_id", inquiryId);
  const quoteIds = (quotes ?? []).map((row) => row.id);
  if (quoteIds.length) {
    const { data: versions } = await service.from("quote_versions").select("id").in("quote_id", quoteIds);
    const versionIds = (versions ?? []).map((row) => row.id);
    if (versionIds.length) {
      await service.from("quote_contract_confirmations").delete().in("quote_version_id", versionIds);
      await service.from("quote_manual_deliveries").delete().in("quote_version_id", versionIds);
      await service.from("quote_approvals").delete().in("quote_version_id", versionIds);
      await service.from("quote_approval_tokens").delete().in("quote_version_id", versionIds);
      await service.from("quote_versions").delete().in("id", versionIds);
    }
    await service.from("quotes").delete().in("id", quoteIds);
  }
  const projectIds = [inquiry?.converted_project_id].filter((id): id is string => Boolean(id));
  if (projectIds.length) { await service.from("payments").delete().in("project_id", projectIds); await service.from("projects").delete().in("id", projectIds); }
  const customerIds = [inquiry?.converted_customer_id].filter((id): id is string => Boolean(id));
  if (customerIds.length) await service.from("customers").delete().in("id", customerIds);
  await service.from("projects").delete().eq("inquiry_id", inquiryId);
  await service.from("customers").delete().eq("inquiry_id", inquiryId);
  await service.from("inquiries").delete().eq("id", inquiryId);
}
