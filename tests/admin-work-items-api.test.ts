import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";
import { NextRequest } from "next/server";

import { registerPathAlias } from "./helpers/register-path-alias";

let rpcArgs: Record<string, unknown> | undefined;
let route: typeof import("../src/app/api/admin/work-items/route");

before(() => {
  registerPathAlias();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApi = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");
  mock.method(adminApi, "getVerifiedAdminSupabase", async () => ({
    ok: true as const,
    supabase: {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        rpcArgs = args;
        return {
          data: {
            asOf: "2026-10-10T00:00:00.000Z",
            counts: { total: 1, newInquiry: 1, quote: 0, projectConversion: 0, overduePayment: 0 },
            pagination: { page: 1, pageSize: 25, total: 1, hasNextPage: false },
            items: [],
          },
          error: null,
        };
      },
    } as never,
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  route = require("../src/app/api/admin/work-items/route") as typeof route;
});

after(() => mock.restoreAll());

describe("관리자 오늘 할 일 API", () => {
  test("인증된 요청의 query를 RPC에 전달하고 snapshot 계약을 반환한다", async () => {
    rpcArgs = undefined;
    const response = await route.GET(new NextRequest("http://localhost/api/admin/work-items?page=2&pageSize=10&group=quote&asOf=2026-10-10T00:00:00.000Z"));
    assert.equal(response.status, 200);
    assert.deepEqual(rpcArgs, { p_page: 2, p_page_size: 10, p_group: "quote", p_now: "2026-10-10T00:00:00.000Z" });
    assert.equal((await response.json()).data.pagination.pageSize, 25);
  });

  test("페이지, 크기, 그룹 경계를 검증한다", async () => {
    assert.equal((await route.GET(new NextRequest("http://localhost/api/admin/work-items?page=0"))).status, 400);
    assert.equal((await route.GET(new NextRequest("http://localhost/api/admin/work-items?pageSize=101"))).status, 400);
    assert.equal((await route.GET(new NextRequest("http://localhost/api/admin/work-items?group=unknown"))).status, 400);
    assert.equal((await route.GET(new NextRequest("http://localhost/api/admin/work-items?asOf=not-a-date"))).status, 400);
  });
});
