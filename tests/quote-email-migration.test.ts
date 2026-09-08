import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202609070001_quote_email_delivery.sql",
);

describe("견적 이메일 migration", () => {
  it("발송 작업과 만료 Slack 작업의 내구성·멱등성·권한을 정의한다", () => {
    assert.equal(existsSync(migrationPath), true, "견적 이메일 migration이 필요하다");
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    for (const table of ["quote_email_deliveries", "quote_expiration_alerts"]) {
      assert.match(sql, new RegExp(`create table public\\.${table}`));
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
      assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
    }

    assert.match(sql, /create unique index quote_email_deliveries_current_version_idx/);
    assert.match(sql, /return query select 'retry_required'::text, current_delivery;\s+return;/);
    assert.match(sql, /return query select 'existing'::text, current_delivery;\s+return;/);
    assert.match(sql, /where superseded_at is null/);
    assert.match(sql, /unique \(approval_token_id\)/);
    assert.match(sql, /alter column expires_at drop not null/);
    assert.match(sql, /create trigger supersede_quote_email_delivery_on_token_close/);
    assert.equal(
      sql.match(/for update(?: of [a-z_]+)? skip locked/g)?.length,
      2,
      "두 작업 큐 모두 SKIP LOCKED로 claim해야 한다",
    );

    for (const rpc of [
      "enqueue_quote_email_delivery",
      "claim_quote_email_deliveries",
      "finalize_quote_email_delivery",
      "fail_quote_email_delivery",
      "retry_quote_email_delivery",
      "schedule_quote_lifecycle",
      "claim_quote_expiration_alerts",
      "finalize_quote_expiration_alert",
      "fail_quote_expiration_alert",
    ]) {
      assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`));
      assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}`));
    }
  });

  it("발송 성공 전 견적을 sent로 만들지 않고 공개 토큰 사용을 차단한다", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const issueToken = sql.match(
      /create or replace function public\.issue_quote_approval_token[\s\S]+?\$\$;/,
    )?.[0] ?? "";
    assert.doesNotMatch(issueToken, /update public\.quotes set status = 'sent'/);
    assert.match(sql, /quote_row\.status <> 'sent'/);
    assert.match(sql, /token_row\.expires_at is null/);
    assert.match(sql, /expires_at = p_sent_at \+ interval '7 days'/);
  });
});
