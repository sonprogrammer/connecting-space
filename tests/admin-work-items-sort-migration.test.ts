import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import path from "node:path";

const migration = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/202610120001_admin_work_items_sort.sql"),
  "utf8",
);

describe("관리자 업무 정렬 migration 계약", () => {
  test("sort와 latestAt을 RPC 계약에 포함한다", () => {
    assert.match(migration, /p_sort text/);
    assert.match(migration, /p_sort not in \('waiting', 'latest'\)/);
    assert.match(migration, /latest_at/);
    assert.match(migration, /'latestAt'/);
    assert.match(migration, /'sort', p_sort/);
  });

  test("업무 우선순위를 정렬보다 먼저 적용하고 전체 count를 유지한다", () => {
    assert.match(migration, /priority,\s*case when p_sort = 'waiting'/);
    assert.match(migration, /'total', \(select count\(\*\) from work_items\)/);
    assert.match(migration, /'total', \(select count\(\*\) from visible_items\)/);
    assert.match(migration, /coalesce\(inquiry\.qualified_at, inquiry\.created_at\)/);
  });
});
