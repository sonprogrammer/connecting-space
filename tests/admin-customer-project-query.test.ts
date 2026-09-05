import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { QueryClient } from "@tanstack/react-query";

import {
  customerProjectQueryKeys,
  parseAdminQueryResponse,
  type AdminQueryError,
} from "../src/widgets/admin-customer-projects/model/admin-customer-project-queries";

describe("admin customer/project query model", () => {
  test("keeps list keys separate for every pagination and filter value", () => {
    assert.notDeepEqual(
      customerProjectQueryKeys.customers.list(1, "acme"),
      customerProjectQueryKeys.customers.list(2, "acme"),
    );
    assert.notDeepEqual(
      customerProjectQueryKeys.projects.list(1, "", "planning"),
      customerProjectQueryKeys.projects.list(1, "", "completed"),
    );
  });

  test("turns an API failure into an error with status and auth flag", async () => {
    await assert.rejects(
      () =>
        parseAdminQueryResponse(
          new Response(
            JSON.stringify({
              error: { code: "ADMIN_AUTH_REQUIRED", message: "expired" },
            }),
            { status: 401 },
          ),
        ),
      (error: AdminQueryError) =>
        error.status === 401 && error.isAuthExpired && error.message.includes("로그인"),
    );
  });

  test("keeps cached detail data available while a later response replaces it", () => {
    const client = new QueryClient();
    const key = customerProjectQueryKeys.customers.detail("customer-1");
    client.setQueryData(key, { id: "customer-1", name: "기존 고객" });
    client.setQueryData(key, { id: "customer-1", name: "수정 고객" });
    assert.equal(client.getQueryData<{ name: string }>(key)?.name, "수정 고객");
  });
});
