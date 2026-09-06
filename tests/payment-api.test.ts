import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type ProjectPaymentsRoute = typeof import("../src/app/api/admin/projects/[id]/payments/route");
type PaymentRoute = typeof import("../src/app/api/admin/payments/[id]/route");
type ReceiptsRoute = typeof import("../src/app/api/admin/payments/[id]/receipts/route");
type ReceiptRoute = typeof import("../src/app/api/admin/payment-receipts/[id]/route");

const projectId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";
const receiptId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const context = (id: string) => ({ params: Promise.resolve({ id }) });

let verifiedAdmin: { ok: true; supabase: SupabaseClient<Database> } | { ok: false; response: NextResponse };
let projectPaymentsRoute: ProjectPaymentsRoute;
let paymentRoute: PaymentRoute;
let receiptsRoute: ReceiptsRoute;
let receiptRoute: ReceiptRoute;

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApi, "getVerifiedAdminSupabase", async () => verifiedAdmin);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  projectPaymentsRoute = require("../src/app/api/admin/projects/[id]/payments/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  paymentRoute = require("../src/app/api/admin/payments/[id]/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  receiptsRoute = require("../src/app/api/admin/payments/[id]/receipts/route");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  receiptRoute = require("../src/app/api/admin/payment-receipts/[id]/route");
});

after(() => mock.restoreAll());

describe("admin project payment API", () => {
  test("rejects unauthenticated access", async () => {
    verifiedAdmin = { ok: false, response: NextResponse.json({ error: { code: "ADMIN_AUTH_REQUIRED" } }, { status: 401 }) };
    const response = await projectPaymentsRoute.GET(new NextRequest("http://localhost"), context(projectId));
    assert.equal(response.status, 401);
  });

  test("rejects an invalid project id before querying", async () => {
    verifiedAdmin = { ok: false, response: NextResponse.json({}, { status: 401 }) };
    const response = await projectPaymentsRoute.GET(new NextRequest("http://localhost"), context("invalid"));
    assert.equal(response.status, 400);
  });

  test("returns schedules, receipts, partial balances, and project totals", async () => {
    const payment = { id: paymentId, project_id: projectId, kind: "deposit", status: "expected", amount: 1000, due_date: null, paid_at: null, memo: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" };
    const receipt = { id: receiptId, payment_id: paymentId, amount: 400, received_at: "2026-09-06T00:00:00Z", idempotency_key: idempotencyKey, memo: null, created_at: "2026-09-06T00:00:00Z", updated_at: "2026-09-06T00:00:00Z" };
    setClient([ok({ id: projectId, contract_amount: 1000 }), ok([payment]), ok([receipt])]);

    const response = await projectPaymentsRoute.GET(new NextRequest("http://localhost"), context(projectId));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.summary.expectedRevenue, 1000);
    assert.equal(body.data.summary.confirmedRevenue, 1000);
    assert.equal(body.data.summary.receivedTotal, 400);
    assert.equal(body.data.summary.outstanding, 600);
    assert.equal(body.data.payments[0].receivedAmount, 400);
    assert.equal(body.data.payments[0].outstandingAmount, 600);
  });

  test("validates and creates a payment schedule", async () => {
    setClient([ok({ id: paymentId }, 201)]);
    const invalid = await projectPaymentsRoute.POST(jsonRequest({ kind: "deposit", amount: 0 }), context(projectId));
    assert.equal(invalid.status, 400);

    setClient([ok({ id: paymentId }, 201)]);
    const created = await projectPaymentsRoute.POST(jsonRequest({ kind: "deposit", amount: 1000, dueDate: "", memo: "" }), context(projectId));
    assert.equal(created.status, 201);
  });

  test("maps project payment read failures without exposing database details", async () => {
    setClient([fail("XX000", "sensitive database detail", 500)]);
    const response = await projectPaymentsRoute.GET(new NextRequest("http://localhost"), context(projectId));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.message, "Failed to read project payments");
  });
});

describe("admin payment mutation APIs", () => {
  test("requires admin authentication for every mutation", async () => {
    verifiedAdmin = { ok: false, response: NextResponse.json({ error: { code: "ADMIN_AUTH_REQUIRED" } }, { status: 401 }) };
    assert.equal((await paymentRoute.PATCH(jsonRequest({ status: "paid" }), context(paymentId))).status, 401);
    assert.equal((await paymentRoute.DELETE(new NextRequest("http://localhost"), context(paymentId))).status, 401);
    assert.equal((await receiptsRoute.POST(jsonRequest({ amount: 1, idempotencyKey }), context(paymentId))).status, 401);
    assert.equal((await receiptRoute.PATCH(jsonRequest({ amount: 1 }), context(receiptId))).status, 401);
    assert.equal((await receiptRoute.DELETE(new NextRequest("http://localhost"), context(receiptId))).status, 401);
  });

  test("updates and deletes payment schedules", async () => {
    setClient([ok({ id: paymentId })]);
    assert.equal((await paymentRoute.PATCH(jsonRequest({ status: "paid" }), context(paymentId))).status, 200);
    setClient([ok({ id: paymentId })]);
    assert.equal((await paymentRoute.DELETE(new NextRequest("http://localhost", { method: "DELETE" }), context(paymentId))).status, 200);
  });

  test("returns 404 when a payment mutation matches no row", async () => {
    setClient([ok(null)]);
    const response = await paymentRoute.PATCH(jsonRequest({ status: "paid" }), context(paymentId));
    assert.equal(response.status, 404);
  });

  test("treats a duplicate receipt idempotency key as a successful retry", async () => {
    const row = { id: receiptId, payment_id: paymentId, amount: 400, idempotency_key: idempotencyKey };
    setClient([fail("23505", "duplicate key"), ok(row)]);
    const response = await receiptsRoute.POST(jsonRequest({ amount: 400, idempotencyKey }), context(paymentId));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, row);
  });

  test("rejects reuse of an idempotency key with a different amount", async () => {
    const row = { id: receiptId, payment_id: paymentId, amount: 500, idempotency_key: idempotencyKey };
    setClient([fail("23505", "duplicate key"), ok(row)]);
    const response = await receiptsRoute.POST(jsonRequest({ amount: 400, idempotencyKey }), context(paymentId));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "PAYMENT_RECEIPT_IDEMPOTENCY_CONFLICT");
  });

  test("creates and deletes actual receipts", async () => {
    setClient([ok({ id: receiptId }, 201)]);
    assert.equal((await receiptsRoute.POST(jsonRequest({ amount: 400, idempotencyKey }), context(paymentId))).status, 201);
    setClient([ok({ id: receiptId })]);
    assert.equal((await receiptRoute.DELETE(new NextRequest("http://localhost", { method: "DELETE" }), context(receiptId))).status, 200);
  });

  test("maps receipt foreign keys and unexpected database errors", async () => {
    setClient([fail("23503", "foreign key")]);
    assert.equal((await receiptsRoute.POST(jsonRequest({ amount: 400, idempotencyKey }), context(paymentId))).status, 404);
    setClient([fail("XX000", "sensitive database detail", 500)]);
    const response = await receiptsRoute.POST(jsonRequest({ amount: 400, idempotencyKey }), context(paymentId));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.message, "Failed to create payment receipt");
  });

  test("updates actual receipts and returns 404 for a missing receipt", async () => {
    setClient([ok({ id: receiptId, amount: 500 })]);
    assert.equal((await receiptRoute.PATCH(jsonRequest({ amount: 500 }), context(receiptId))).status, 200);
    setClient([ok(null)]);
    assert.equal((await receiptRoute.PATCH(jsonRequest({ amount: 500 }), context(receiptId))).status, 404);
  });
});

function setClient(responses: Response[]) {
  let index = 0;
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async () => responses[index++] ?? fail("XX000", "unexpected request") },
  });
  verifiedAdmin = { ok: true, supabase: client };
}

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function fail(code: string, message: string, status = 409) {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), { status, headers: { "content-type": "application/json" } });
}
