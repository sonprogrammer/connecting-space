import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildCustomerPayload,
  buildProjectPayload,
  getSaveFailure,
  projectStatusLabels,
  toCustomerListState,
} from "../src/widgets/admin-customer-projects/model/admin-customer-project-state";

describe("admin customer/project model", () => {
  test("builds customer and project update payloads", () => {
    assert.deepEqual(buildCustomerPayload({ name: " Acme ", email: "a@b.com", phone: "010", companyName: "Acme", websiteUrl: "", memo: "메모" }), {
      name: " Acme ", email: "a@b.com", phone: "010", companyName: "Acme", websiteUrl: "", memo: "메모",
    });
    assert.equal(buildProjectPayload({ name: "웹사이트", description: "", status: "in_progress", contractAmount: "1200000", expectedStartDate: "", expectedLaunchDate: "2026-10-01", launchedAt: "", memo: "" }).contractAmount, 1200000);
  });

  test("normalizes empty and unauthorized customer lists", () => {
    assert.deepEqual(toCustomerListState({ data: { items: [], page: 1, totalPages: 0 } }), { status: "empty", page: 1, totalPages: 0 });
    const unauthorized = toCustomerListState({ error: { code: "AUTH", message: "no" } }, 401);
    assert.equal(unauthorized.status, "error");
    if (unauthorized.status === "error") assert.equal(unauthorized.message, "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.");
  });

  test("exposes readable project statuses and validation fields", () => {
    assert.equal(projectStatusLabels.in_progress, "제작 중");
    assert.deepEqual(getSaveFailure(400, { error: { code: "VALIDATION_ERROR", message: "bad", details: { fieldErrors: { name: ["필수"] } } } }, "고객").fieldErrors, { name: ["필수"] });
  });
});
