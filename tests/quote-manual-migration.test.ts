import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/202609080001_quote_manual_delivery.sql"),
  "utf8",
).toLowerCase();

describe("견적 PDF 수동 발급 migration 계약", () => {
  test("발송 방식과 관리자 읽기 전용 감사 이력을 정의한다", () => {
    assert.match(sql, /create type public\.quote_delivery_method as enum \('email', 'manual'\)/);
    assert.match(sql, /add column delivery_method public\.quote_delivery_method/);
    assert.match(sql, /create table public\.quote_manual_deliveries/);
    assert.match(sql, /unique \(quote_version_id, idempotency_key_hash\)/);
    assert.match(sql, /where superseded_at is null/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /grant select on table public\.quote_manual_deliveries to authenticated/);
    assert.match(sql, /grant all on table public\.quote_manual_deliveries to service_role/);
  });

  test("수동 발급 RPC가 해시만 받고 7일 만료와 sent/manual 상태를 함께 기록한다", () => {
    assert.match(sql, /create or replace function public\.issue_quote_manual_delivery/);
    assert.match(sql, /p_token_hash text/);
    assert.match(sql, /p_idempotency_key_hash text/);
    assert.doesNotMatch(sql, /p_token text/);
    assert.match(sql, /expires_at := p_issued_at \+ interval '7 days'/);
    assert.match(sql, /set status = 'sent', delivery_method = 'manual'/);
    assert.match(sql, /return query select 'existing'::text, existing_delivery/);
    assert.match(sql, /set revoked_at = p_issued_at/);
  });

  test("Resend 성공 finalize만 email 발송 방식을 기록한다", () => {
    const finalize = sql.match(
      /create or replace function public\.finalize_quote_email_delivery[\s\S]+?\$\$;/,
    )?.[0] ?? "";
    assert.match(finalize, /set status = 'sent', delivery_method = 'email'/);
    assert.match(sql, /create trigger supersede_quote_manual_delivery_on_token_close/);
  });
});
