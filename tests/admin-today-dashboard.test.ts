import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AdminInquiryListItem } from "../src/entities/inquiry";
import { getTodayInquiryTasks, todayDashboardActions } from "../src/widgets/admin-dashboard/model/admin-today-dashboard";

const inquiries: AdminInquiryListItem[] = [
  {
    id: "newest",
    customer_name: "최근 문의",
    email: null,
    phone: null,
    company_name: null,
    service_type: "website",
    status: "new",
    created_at: "2026-10-10T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z",
  },
  {
    id: "contacted",
    customer_name: "상담 중 문의",
    email: null,
    phone: null,
    company_name: null,
    service_type: "website",
    status: "contacted",
    created_at: "2026-10-10T08:00:00.000Z",
    updated_at: "2026-10-10T08:00:00.000Z",
  },
  {
    id: "oldest",
    customer_name: "오래된 문의",
    email: null,
    phone: null,
    company_name: null,
    service_type: "website",
    status: "new",
    created_at: "2026-10-09T08:00:00.000Z",
    updated_at: "2026-10-09T08:00:00.000Z",
  },
];

describe("today dashboard inquiry tasks", () => {
  test("includes only new inquiries and puts the longest-waiting first by default", () => {
    assert.deepEqual(
      getTodayInquiryTasks(inquiries, "oldest" ).map(({ id }) => id),
      ["oldest", "newest"],
    );
  });

  test("supports newest-first ordering without changing task eligibility", () => {
    assert.deepEqual(
      getTodayInquiryTasks(inquiries, "newest").map(({ id }) => id),
      ["newest", "oldest"],
    );
  });

  test("does not link the unavailable project-conversion count to the inquiry list", () => {
    assert.equal(
      todayDashboardActions.find(({ id }) => id === "conversions")?.href,
      null,
    );
  });

  test("does not link to unrelated screens for action types without a listing API", () => {
    assert.deepEqual(
      todayDashboardActions
        .filter(({ available }) => !available)
        .map(({ href }) => href),
      [null, null, null],
    );
  });
});
