import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildCustomerPayload,
  buildProjectPayload,
  getSaveFailure,
  getConvertedProjectId,
  getCustomerDetailUrl,
  getInquiryDetailUrl,
  getInquiryAnchorHref,
  getProjectDetailUrl,
  projectStatusLabels,
  resolveSelectedId,
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

  test("uses the inquiry conversion link to resolve a project outside the current list page", () => {
    assert.equal(getConvertedProjectId({ converted_project_id: "project-21" }), "project-21");
    assert.equal(getConvertedProjectId({ converted_project_id: null }), null);
    assert.equal(getCustomerDetailUrl("customer-21"), "/api/admin/customers/customer-21");
    assert.equal(getInquiryDetailUrl("inquiry-21"), "/api/admin/inquiries/inquiry-21");
    assert.equal(getInquiryAnchorHref("inquiry-21"), "/admin#inquiry-inquiry-21");
    assert.equal(getProjectDetailUrl("project-21"), "/api/admin/projects/project-21");
  });

  test("resets a selection when a list query no longer contains it", () => {
    assert.equal(resolveSelectedId("customer-1", [{ id: "customer-2" }]), "customer-2");
    assert.equal(resolveSelectedId("customer-1", []), null);
    assert.equal(resolveSelectedId("customer-2", [{ id: "customer-2" }]), "customer-2");
  });
});
