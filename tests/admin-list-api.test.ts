import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import { NextRequest } from "next/server";

import { registerPathAlias } from "./helpers/register-path-alias";

type QueryCapture = { table?: string; or?: string; eq?: string; order: string[]; range?: [number, number] };
let capture: QueryCapture;
let adminRoute: typeof import("../src/app/api/admin/customers/route");
let projectRoute: typeof import("../src/app/api/admin/projects/route");

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApi, "getVerifiedAdminSupabase", async () => ({ ok: true as const, supabase: fakeSupabase() }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  adminRoute = require("../src/app/api/admin/customers/route") as typeof adminRoute;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  projectRoute = require("../src/app/api/admin/projects/route") as typeof projectRoute;
});

after(() => mock.restoreAll());

describe("admin list APIs", () => {
  test("passes customer search, ordering, and range to Supabase", async () => {
    capture = { order: [] };
    const response = await adminRoute.GET(new NextRequest("http://localhost/api/admin/customers?q=acme&page=2&pageSize=10&sort=name&direction=asc"));
    assert.equal(response.status, 200);
    assert.equal(capture.table, "customers");
    assert.match(capture.or ?? "", /name\.ilike/);
    assert.deepEqual(capture.order, ["name:true", "id:true"]);
    assert.deepEqual(capture.range, [10, 19]);
    assert.equal((await response.json()).data.totalPages, 3);
  });

  test("passes project status filter and rejects unsupported status", async () => {
    capture = { order: [] };
    const response = await projectRoute.GET(new NextRequest("http://localhost/api/admin/projects?status=completed&pageSize=5"));
    assert.equal(response.status, 200);
    assert.equal(capture.eq, "status=completed");
    const invalid = await projectRoute.GET(new NextRequest("http://localhost/api/admin/projects?status=unknown"));
    assert.equal(invalid.status, 400);
  });
});

function fakeSupabase() {
  const builder = {
    from(table: string) { capture.table = table; return this; },
    select() { return this; },
    or(value: string) { capture.or = value; return this; },
    eq(column: string, value: string) { capture.eq = `${column}=${value}`; return this; },
    order(column: string, options: { ascending: boolean }) { capture.order.push(`${column}:${options.ascending}`); return this; },
    range(from: number, to: number) { capture.range = [from, to]; return this; },
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: [], count: 25, error: null })); },
  };
  return builder;
}
