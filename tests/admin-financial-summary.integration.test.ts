import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/shared/types/database.generated";
import { calculateProjectPaymentSummary } from "../src/entities/payment/model/summary";

const enabled = process.env.RUN_FINANCIAL_INTEGRATION_TESTS === "1";

test("local financial summary: SQL parity, filters, RLS, overpayment, full dataset and cleanup", { skip: !enabled }, async (t) => {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && anonKey && serviceKey);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "local database required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(url, serviceKey, options);
  const anon = createClient<Database>(url, anonKey, options);
  const users: string[] = [];
  const customerId = randomUUID();
  const statuses = ["planning", "in_progress", "review", "completed", "paused", "cancelled"] as const;
  const projectIds = statuses.map(() => randomUUID());
  const fixtures = statuses.map((status, index) => ({
    id: projectIds[index], customer_id: customerId, name: "financial fixture", status, contract_amount: 1000,
  }));
  async function login(isAdmin: boolean) {
    const email = `financial-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null);
    const id = created.data.user.id;
    users.push(id); // Track before subsequent steps so partial failures clean up.
    if (isAdmin) assert.equal((await service.from("admins").insert({ id, email })).error, null);
    const client = createClient<Database>(url!, anonKey!, options);
    assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
    return client;
  }
  try {
    const admin = await login(true);
    const member = await login(false);
    await t.test("empty snapshot and unauthorized RPC", async () => {
      const empty = await admin.rpc("get_admin_financial_summary", { p_status: "all" });
      assert.equal(empty.error, null);
      assert.equal((empty.data as Record<string, unknown>).projectCount, 0, "use isolated reset database");
      for (const key of ["expectedRevenue", "confirmedRevenue", "receivedTotal", "outstanding"]) {
        assert.equal((empty.data as Record<string, unknown>)[key], 0);
      }
      assert.equal((await anon.rpc("get_admin_financial_summary", {})).error?.code, "42501");
      assert.equal((await member.rpc("get_admin_financial_summary", {})).error?.code, "42501");
      assert.equal((await member.from("projects").select("id")).data?.length, 0);
    });
    assert.equal((await service.from("customers").insert({ id: customerId, name: "financial fixture" })).error, null);
    assert.equal((await service.from("projects").insert(fixtures)).error, null);
    const payments: Database["public"]["Tables"]["payments"]["Insert"][] = [
      { id: randomUUID(), project_id: projectIds[0], kind: "deposit", status: "paid", amount: 300 },
      { id: randomUUID(), project_id: projectIds[0], kind: "balance", status: "expected", amount: 700 },
      { id: randomUUID(), project_id: projectIds[0], kind: "extra", status: "expected", amount: 200 },
      { id: randomUUID(), project_id: projectIds[0], kind: "extra", status: "cancelled", amount: 900 },
      { id: randomUUID(), project_id: projectIds[1], kind: "deposit", status: "expected", amount: 100 },
      { id: randomUUID(), project_id: projectIds[2], kind: "balance", status: "expected", amount: 1000 },
    ];
    assert.equal((await service.from("payments").insert(payments)).error, null);
    const receipts = [
      { payment_id: payments[0].id!, amount: 300, idempotency_key: randomUUID() },
      { payment_id: payments[1].id!, amount: 200, idempotency_key: randomUUID() },
      { payment_id: payments[1].id!, amount: 50, idempotency_key: randomUUID() },
      { payment_id: payments[3].id!, amount: 100, idempotency_key: randomUUID() },
      { payment_id: payments[4].id!, amount: 500, idempotency_key: randomUUID() },
    ];
    assert.equal((await service.from("payment_receipts").insert(receipts)).error, null);
    await t.test("caller RLS still hides populated financial tables from a non-admin", async () => {
      for (const table of ["projects", "payments", "payment_receipts"] as const) {
        const hidden = await member.from(table).select("id");
        assert.equal(hidden.error, null);
        assert.deepEqual(hidden.data, []);
        const visible = await admin.from(table).select("id");
        assert.equal(visible.error, null);
        assert.ok(visible.data && visible.data.length > 0);
      }
    });
    await t.test("each status and active/all match existing project calculation", async () => {
      for (const status of [...statuses, "active", "all"]) {
        const selected = fixtures.filter((project) => status === "all"
          || (status === "active" ? !["completed", "cancelled"].includes(project.status) : project.status === status));
        const expected = { expectedRevenue: 0, confirmedRevenue: 0, receivedTotal: 0, outstanding: 0 };
        for (const project of selected) {
          const ownPayments = payments.filter((payment) => payment.project_id === project.id).map((p) => ({ ...p, id: p.id!, status: p.status ?? "expected" }));
          const ownReceipts = receipts.filter((r) => ownPayments.some((p) => p.id === r.payment_id));
          const summary = calculateProjectPaymentSummary(project.contract_amount, ownPayments, ownReceipts);
          for (const key of Object.keys(expected) as Array<keyof typeof expected>) expected[key] += summary[key];
        }
        const result = await admin.rpc("get_admin_financial_summary", { p_status: status });
        assert.equal(result.error, null);
        const actual = result.data as Record<string, unknown>;
        assert.equal(actual.projectCount, selected.length);
        assert.equal(actual.status, status);
        assert.ok(Number.isFinite(Date.parse(actual.asOf as string)));
        for (const key of Object.keys(expected) as Array<keyof typeof expected>) assert.equal(actual[key], expected[key], `${status}: ${key}`);
        if (status === "active") assert.equal(actual.outstanding, 1550, "project overpayment must not offset another project's debt");
      }
      assert.equal((await admin.rpc("get_admin_financial_summary", { p_status: "invalid" })).error?.code, "22023");
    });
    await t.test("aggregate is not truncated by the PostgREST row limit", async () => {
      const rows = Array.from({ length: 1001 }, (_, index) => ({ customer_id: customerId, name: "bulk", status: "planning" as const, contract_amount: index < 2 ? 2_000_000_000 : 1 }));
      assert.equal((await service.from("projects").insert(rows)).error, null);
      const results = await Promise.all(Array.from({ length: 3 }, () => admin.rpc("get_admin_financial_summary", {})));
      for (const result of results) {
        assert.equal(result.error, null);
        assert.equal((result.data as Record<string, unknown>).projectCount, 1005);
        assert.equal((result.data as Record<string, unknown>).expectedRevenue, 4_000_005_199, "sum must exceed PostgreSQL integer range safely");
      }
    });
  } finally {
    assert.equal((await service.from("projects").delete().eq("customer_id", customerId)).error, null);
    assert.equal((await service.from("customers").delete().eq("id", customerId)).error, null);
    assert.equal((await service.from("projects").select("id", { count: "exact", head: true }).eq("customer_id", customerId)).count, 0);
    for (const id of users) {
      assert.equal((await service.from("admins").delete().eq("id", id)).error, null);
      assert.equal((await service.auth.admin.deleteUser(id)).error, null);
    }
  }
});
