import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202609060001_project_payment_receipts.sql",
);

describe("project payment receipts migration", () => {
  test("defines receipt integrity, audit timestamps, and admin-only access", () => {
    assert.equal(existsSync(migrationPath), true, "payment receipt migration must exist");
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    assert.match(sql, /create table public\.payment_receipts/);
    assert.match(sql, /amount integer not null check \(amount > 0\)/);
    assert.match(sql, /unique \(payment_id, idempotency_key\)/);
    assert.match(sql, /payment_receipts_set_updated_at/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /public\.is_admin\(\)/);
    assert.match(sql, /revoke all on table public\.payment_receipts from anon/);
    assert.match(sql, /grant select, insert, update, delete on table public\.payment_receipts to authenticated/);
    assert.match(sql, /grant all on table public\.payment_receipts to service_role/);
  });
});
