import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseListQuery, paginatedResponse } from "../src/shared/api/list-query";

describe("admin list query", () => {
  test("uses safe defaults and computes pagination metadata", () => {
    const result = parseListQuery(new URLSearchParams(), {
      sortFields: ["created_at", "name"],
    });

    assert.deepEqual(result, {
      ok: true,
      value: { q: "", page: 1, pageSize: 20, sort: "created_at", direction: "desc" },
    });
    assert.ok(result.ok);
    assert.deepEqual(paginatedResponse(["row"], 41, result.value), {
      items: ["row"], page: 1, pageSize: 20, total: 41, totalPages: 3,
    });
  });

  test("rejects invalid bounds and unsupported ordering", () => {
    const result = parseListQuery(new URLSearchParams("page=0&pageSize=101&sort=secret&direction=sideways"), {
      sortFields: ["created_at"],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.errors, [
      "page must be a positive integer",
      "pageSize must be between 1 and 100",
      "sort must be one of: created_at",
      "direction must be asc or desc",
    ]);
  });
});
