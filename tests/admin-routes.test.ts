import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  getAdminLoginDestination,
  getAdminLoginHref,
} from "../src/shared/lib/auth/admin-login-redirect";
import { getLegacyInquiryRedirect } from "../src/widgets/admin-dashboard/model/admin-route-overview";

describe("admin feature routes", () => {
  test("connects each independent route to the existing feature widget", () => {
    const dashboard = readFileSync("src/app/admin/page.tsx", "utf8");
    const inquiries = readFileSync("src/app/admin/inquiries/page.tsx", "utf8");
    const customers = readFileSync("src/app/admin/customers/page.tsx", "utf8");
    const projects = readFileSync("src/app/admin/projects/page.tsx", "utf8");
    const portfolio = readFileSync("src/app/admin/portfolio/page.tsx", "utf8");
    const content = readFileSync("src/app/admin/content/page.tsx", "utf8");

    assert.match(dashboard, /<AdminRouteOverview \/>/);
    assert.match(inquiries, /<AdminInquiryList \/>/);
    assert.match(inquiries, /<AdminQuoteWorkflow \/>/);
    assert.match(customers, /<AdminCustomerProjectManager initialTab="customers" \/>/);
    assert.match(projects, /<AdminCustomerProjectManager initialTab="projects" \/>/);
    assert.match(portfolio, /<AdminPortfolioManager \/>/);
    assert.match(content, /<AdminAutomationContentManager \/>/);
  });

  test("moves only legacy inquiry hashes to the inquiry route", () => {
    assert.equal(
      getLegacyInquiryRedirect("#inquiry-8d7a"),
      "/admin/inquiries#inquiry-8d7a",
    );
    assert.equal(getLegacyInquiryRedirect("#settings"), null);
    assert.equal(getLegacyInquiryRedirect("#inquiry-"), null);
  });

  test("preserves admin pathname and search in the login next parameter", () => {
    assert.equal(
      getAdminLoginHref("/admin/projects", "?status=in_progress&page=2"),
      "/admin/login?next=%2Fadmin%2Fprojects%3Fstatus%3Din_progress%26page%3D2",
    );
    assert.equal(getAdminLoginHref(), "/admin/login?next=%2Fadmin");
    assert.equal(getAdminLoginHref("/portfolio", "?draft=1"), "/admin/login?next=%2Fadmin");
  });

  test("restores only safe admin destinations after login", () => {
    assert.equal(
      getAdminLoginDestination("?next=%2Fadmin%2Fprojects%3Fstatus%3Din_progress"),
      "/admin/projects?status=in_progress",
    );
    assert.equal(getAdminLoginDestination("?next=%2Fadmin%3Ftab%3Dactivity"), "/admin?tab=activity");
    assert.equal(getAdminLoginDestination("?next=https%3A%2F%2Fevil.example"), "/admin");
    assert.equal(getAdminLoginDestination("?next=%2F%2Fevil.example"), "/admin");
    assert.equal(getAdminLoginDestination("?next=%2Fportfolio"), "/admin");
  });
});
