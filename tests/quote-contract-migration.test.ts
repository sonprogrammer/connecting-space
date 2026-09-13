import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync("supabase/migrations/202609120001_quote_contract_conversion.sql", "utf8");

test("contract conversion migration defines atomic confirmation safeguards", () => {
  for (const fragment of ["quote_contract_confirmations", "idempotency_key_hash", "for update", "quote_approvals", "quote_email_deliveries", "quote_manual_deliveries", "convert_inquiry_to_project", "payments_project_deposit_balance_idx", "security definer", "revoke all on function public.confirm_quote_contract"]) {
    assert.ok(sql.toLowerCase().includes(fragment.toLowerCase()), `missing migration fragment: ${fragment}`);
  }
});
