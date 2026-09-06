import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/shared/types/database.generated";

const enabled = process.env.RUN_PAYMENT_INTEGRATION_TESTS === "1";

describe("local payment receipt PostgreSQL integration", { skip: !enabled }, () => {
  let service: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let userId = "";
  let customerId = "";
  let projectId = "";
  let paymentId = "";

  before(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(url && anonKey && serviceKey);
    assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "integration test only runs against local Supabase");
    service = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
    anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const loginClient = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const email = `payment-${randomUUID()}@local.test`;
    const password = `Local-${randomUUID()}!`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null, created.error?.message);
    userId = created.data.user.id;
    assert.equal((await service.from("admins").insert({ id: userId, email })).error, null);
    const signed = await loginClient.auth.signInWithPassword({ email, password });
    assert.equal(signed.error, null, signed.error?.message);
    admin = createClient<Database>(url, anonKey, { global: { headers: { Authorization: `Bearer ${signed.data.session.access_token}` } }, auth: { persistSession: false } });
    const customer = await service.from("customers").insert({ name: "Payment integration" }).select("id").single();
    assert.equal(customer.error, null, customer.error?.message);
    customerId = customer.data.id;
    const project = await service.from("projects").insert({ customer_id: customerId, name: "Payment integration", contract_amount: 1000 }).select("id").single();
    assert.equal(project.error, null, project.error?.message);
    projectId = project.data.id;
    const payment = await service.from("payments").insert({ project_id: projectId, kind: "deposit", amount: 500 }).select("id").single();
    assert.equal(payment.error, null, payment.error?.message);
    paymentId = payment.data.id;
  });

  after(async () => {
    if (paymentId) await service.from("payment_receipts").delete().eq("payment_id", paymentId);
    if (projectId) await service.from("projects").delete().eq("id", projectId);
    if (customerId) await service.from("customers").delete().eq("id", customerId);
    if (userId) {
      await service.from("admins").delete().eq("id", userId);
      await service.auth.admin.deleteUser(userId);
    }
  });

  test("allows admins, blocks anon, and rejects a duplicate receipt key", async () => {
    const key = randomUUID();
    const receipt = { payment_id: paymentId, amount: 200, idempotency_key: key };
    const first = await admin.from("payment_receipts").insert(receipt).select("id").single();
    assert.equal(first.error, null, first.error?.message);
    const duplicate = await admin.from("payment_receipts").insert(receipt);
    assert.equal(duplicate.error?.code, "23505");
    const adminRead = await admin.from("payment_receipts").select("id").eq("payment_id", paymentId);
    assert.equal(adminRead.data?.length, 1);
    const anonRead = await anon.from("payment_receipts").select("id").eq("payment_id", paymentId);
    assert.equal(anonRead.error?.code, "42501");
    const serviceRead = await service.from("payment_receipts").select("id", { count: "exact", head: true }).eq("payment_id", paymentId);
    assert.equal(serviceRead.count, 1);
  });
});
