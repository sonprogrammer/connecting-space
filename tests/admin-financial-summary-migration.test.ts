import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("financial RPC preserves caller RLS, snapshot and execute restrictions", () => {
  const sql = readFileSync("supabase/migrations/202610250001_admin_financial_summary.sql", "utf8");
  assert.match(sql, /stable\s+security invoker\s+set search_path = ''/);
  assert.match(sql, /if not public\.is_admin\(\)/);
  assert.match(sql, /revoke all on function .* from public, anon/);
  assert.match(sql, /grant execute on function .* to authenticated/);
  assert.match(sql, /statement_timestamp\(\)/);
});
