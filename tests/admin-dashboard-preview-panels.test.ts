import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preview = require("../src/widgets/admin-dashboard/model/admin-dashboard-preview-queries") as typeof import("../src/widgets/admin-dashboard/model/admin-dashboard-preview-queries");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inquiryQueries = require("../src/entities/inquiry/model/admin-inquiry-queries") as typeof import("../src/entities/inquiry/model/admin-inquiry-queries");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inquiryKeys = require("../src/entities/inquiry/model/admin-inquiry-query-keys") as typeof import("../src/entities/inquiry/model/admin-inquiry-query-keys");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const projectQueries = require("../src/widgets/admin-customer-projects/model/admin-customer-project-queries") as typeof import("../src/widgets/admin-customer-projects/model/admin-customer-project-queries");

describe("admin dashboard preview panels", () => {
  test("dashboard inquiry preview shares the common list query", () => {
    assert.deepEqual(preview.adminDashboardInquiryQueryOptions.queryKey, inquiryKeys.adminInquiryQueryKeys.list());
    assert.equal(preview.adminDashboardInquiryQueryOptions.queryFn, inquiryQueries.fetchAdminInquiryList);
  });

  test("inquiry preview keeps only the first five API-ordered records", () => {
    const records = Array.from({ length: 7 }, (_, index) => ({ id: `inquiry-${index}` }));
    assert.deepEqual(preview.getRecentInquiryPreview(records as never).map((item: { id: string }) => item.id), [
      "inquiry-0", "inquiry-1", "inquiry-2", "inquiry-3", "inquiry-4",
    ]);
  });

  test("upcoming project preview requests in-progress launch-date ascending", () => {
    const options = preview.adminUpcomingProjectQueryOptions;
    assert.deepEqual(options.queryKey, projectQueries.customerProjectQueryKeys.projects.list(1, "", "in_progress", {
      pageSize: 20, sort: "expected_launch_date", direction: "asc",
    }));
    assert.equal(options.queryFn, preview.fetchUpcomingProjects);
  });

  test("project preview keeps server order and labels missing dates", () => {
    const projects = [
      { id: "later", expected_launch_date: "2026-12-20" },
      { id: "unknown", expected_launch_date: null },
      { id: "earlier", expected_launch_date: "2026-11-02" },
    ];
    assert.deepEqual(preview.getUpcomingProjectPreview(projects as never).map((item: { id: string }) => item.id), ["later", "unknown", "earlier"]);
    assert.equal(preview.getProjectLaunchDateLabel(null), "예정일 미정");
    assert.equal(preview.getProjectLaunchDateLabel("2026-11-02"), "2026-11-02");
  });
});
