import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/202609060002_quote_version_approval.sql",
);

describe("견적 버전·승인 migration", () => {
  test("견적·버전·토큰·승인 테이블의 무결성과 관리자 RLS를 정의한다", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of [
      "quotes",
      "quote_versions",
      "quote_approval_tokens",
      "quote_approvals",
    ]) {
      assert.match(sql, new RegExp(`create table public\\.${table}`));
      assert.match(
        sql,
        new RegExp(`alter table public\\.${table} enable row level security`),
      );
      assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon`));
    }

    assert.match(sql, /deposit_amount \+ balance_amount = total_amount/);
    assert.match(sql, /estimated_end_date >= estimated_start_date/);
    assert.match(sql, /jsonb_typeof\(scope_items\) = 'array'/);
    assert.match(sql, /prevent_quote_version_mutation/);
    assert.match(sql, /prevent_quote_approval_mutation/);
    assert.match(sql, /where revoked_at is null and used_at is null/);
  });

  test("관리자 RPC와 최소 권한 공개 RPC를 분리하고 승인 행을 잠근다", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const fn of [
      "create_quote_with_version",
      "create_quote_version",
      "issue_quote_approval_token",
      "revoke_quote_approval_token",
      "cancel_quote",
    ]) {
      assert.match(sql, new RegExp(`function public\\.${fn}`));
      assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`));
      assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+to authenticated`));
    }

    for (const fn of ["get_public_quote_by_token", "approve_quote_by_token"]) {
      assert.match(sql, new RegExp(`function public\\.${fn}`));
      assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]+to anon, authenticated`));
    }

    assert.match(sql, /security definer/g);
    assert.match(sql, /set search_path = public/);
    assert.match(sql, /for update/);
    assert.match(sql, /token_hash = p_token_hash/);
    assert.doesNotMatch(sql, /token_plaintext/);
  });
});
