import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import path from "node:path";

const migration = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/202610100001_admin_work_items.sql"),
  "utf8",
);

describe("관리자 업무 집계 migration 계약", () => {
  test("qualified_at은 상태 진입 때만 기록하고 기존 qualified 데이터를 backfill하지 않는다", () => {
    assert.match(migration, /add column qualified_at timestamptz/);
    assert.match(migration, /new\.status = 'qualified'/);
    assert.match(migration, /old\.status is distinct from 'qualified'/);
    assert.match(migration, /create trigger inquiries_set_qualified_at/);
  });

  test("관리자 RPC가 승인된 그룹 우선순위와 업무별 대기 시각을 정의한다", () => {
    assert.match(migration, /function public\.get_admin_work_items/);
    for (const marker of ["overduePayment", "newInquiry", "projectConversion", "quoteDraft", "quoteSend", "waiting_since", "approved_at", "due_date"]) {
      assert.match(migration, new RegExp(marker));
    }
    assert.match(migration, /grant execute on function public\.get_admin_work_items[\s\S]+to authenticated/);
    assert.match(migration, /superseded_at is null/);
    assert.match(migration, /attempt_count/);
  });
});
