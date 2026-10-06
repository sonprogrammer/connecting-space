import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  adminNavigationGroups,
  getAdminRouteTitle,
  isAdminRouteActive,
} from "../src/widgets/admin-shell/model/navigation";

describe("admin shell navigation", () => {
  test("keeps the approved groups and routes in one ordered model", () => {
    assert.deepEqual(
      adminNavigationGroups.map((group) => ({
        label: group.label,
        hrefs: group.items.map((item) => item.href),
      })),
      [
        { label: "대시보드", hrefs: ["/admin"] },
        { label: "영업", hrefs: ["/admin/inquiries"] },
        { label: "운영", hrefs: ["/admin/customers", "/admin/projects"] },
        { label: "사이트 관리", hrefs: ["/admin/portfolio", "/admin/content"] },
      ],
    );

    const exposedHrefs: string[] = adminNavigationGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    assert.ok(!exposedHrefs.includes("/admin/quotes"));
    assert.ok(!exposedHrefs.includes("/admin/payments"));
  });

  test("matches the dashboard exactly and feature routes by child path", () => {
    assert.equal(isAdminRouteActive("/admin", "/admin"), true);
    assert.equal(isAdminRouteActive("/admin/inquiries", "/admin"), false);
    assert.equal(isAdminRouteActive("/admin/projects", "/admin/projects"), true);
    assert.equal(isAdminRouteActive("/admin/projects/project-1", "/admin/projects"), true);
    assert.equal(isAdminRouteActive("/admin/project", "/admin/projects"), false);
  });

  test("resolves the current page title without inventing unknown routes", () => {
    assert.equal(getAdminRouteTitle("/admin"), "대시보드");
    assert.equal(getAdminRouteTitle("/admin/inquiries/inquiry-1"), "문의·견적");
    assert.equal(getAdminRouteTitle("/admin/content"), "콘텐츠");
    assert.equal(getAdminRouteTitle("/admin/unknown"), "관리자");
  });
});
