import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const manualRequeueMigrationPath = join(
  process.cwd(),
  "supabase/migrations/202608260001_requeue_manual_automation_jobs.sql",
);
const conversionMigrationPath = join(
  process.cwd(),
  "supabase/migrations/202609050001_inquiry_conversion_integrity.sql",
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

  it("atomically requeues manual work and claims only its job id", () => {
    assert.equal(existsSync(manualRequeueMigrationPath), true, "manual requeue migration must exist");
    const sql = readFileSync(manualRequeueMigrationPath, "utf8").toLowerCase();

    assert.match(sql, /create or replace function public\.requeue_automation_job/);
    assert.match(sql, /status in \('pending', 'retry'\)/);
    assert.match(sql, /status = 'processing'/);
    assert.match(sql, /available_at = p_now/);
    assert.match(sql, /locked_at = null/);
    assert.match(sql, /locked_by = null/);
    assert.match(sql, /last_error = null/);
    assert.match(sql, /create or replace function public\.claim_automation_job_by_id/);
    assert.match(sql, /jobs\.id = p_job_id/);
    assert.match(sql, /grant execute on function public\.requeue_automation_job/);
    assert.match(sql, /grant execute on function public\.claim_automation_job_by_id/);
  });

  it("defines atomic inquiry conversion and legacy backfill procedure", () => {
    assert.equal(existsSync(conversionMigrationPath), true);
    const sql = readFileSync(conversionMigrationPath, "utf8").toLowerCase();
    assert.match(sql, /create unique index customers_inquiry_id_unique_idx/);
    assert.match(sql, /create unique index projects_inquiry_id_unique_idx/);
    assert.match(sql, /create or replace function public\.convert_inquiry_to_project/);
    assert.match(sql, /for update/);
    assert.match(sql, /status = 'converted'/);
    assert.match(sql, /backfill procedure/);
    assert.match(sql, /where c\.inquiry_id = i\.id/);
  });
});
