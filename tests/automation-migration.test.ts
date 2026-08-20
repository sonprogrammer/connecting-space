import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202608200001_inquiry_ai_slack_automation.sql",
);
const recoveryMigrationPath = join(
  process.cwd(),
  "supabase/migrations/202608200002_finalize_exhausted_automation_locks.sql",
);

describe("inquiry automation migration", () => {
  it("defines durable tables, RLS, idempotency, and service-role RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    for (const table of [
      "service_offerings",
      "faq_items",
      "inquiry_reply_drafts",
      "automation_jobs",
      "notification_deliveries",
    ]) {
      assert.match(sql, new RegExp(`create table public\\.${table}`));
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    }

    assert.match(sql, /create unique index automation_jobs_active_unique/);
    assert.match(sql, /where status in \('pending', 'processing', 'retry'\)/);
    assert.match(sql, /locked_at < p_now - interval '5 minutes'/);
    assert.match(sql, /create or replace function public\.create_inquiry_with_automation/);
    assert.match(sql, /create or replace function public\.claim_automation_jobs/);
    assert.match(sql, /create or replace function public\.enqueue_automation_job/);
    assert.match(sql, /security definer/g);
    assert.match(sql, /set search_path = public/);
    assert.match(sql, /revoke all on function public\.create_inquiry_with_automation/);
    assert.match(
      sql,
      /grant execute on function public\.create_inquiry_with_automation\(jsonb\) to service_role/,
    );
    assert.doesNotMatch(sql, /insert into public\.(service_offerings|faq_items)/);
  });

  it("finalizes expired processing locks that exhausted all attempts", () => {
    const sql = readFileSync(recoveryMigrationPath, "utf8").toLowerCase();
    assert.match(sql, /status = 'processing'/);
    assert.match(sql, /attempt_count >= max_attempts/);
    assert.match(sql, /locked_at < p_now - interval '5 minutes'/);
    assert.match(sql, /status = 'failed'/);
    assert.match(sql, /inquiry_reply_drafts/);
    assert.match(sql, /notification_deliveries/);
    assert.match(sql, /returning drafts\.inquiry_id/);
    assert.match(sql, /returning deliveries\.inquiry_id/);
  });
});
