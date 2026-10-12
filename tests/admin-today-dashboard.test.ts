import assert from "node:assert/strict";
import { describe, test } from "node:test";

import * as todayDashboardModel from "../src/widgets/admin-dashboard/model/admin-today-dashboard";
import { adminWorkItemsResponseSchema, fetchAdminWorkItems, todayDashboardActions } from "../src/widgets/admin-dashboard/model/admin-today-dashboard";

describe("today dashboard work item contract", () => {
  test("shows all four API-backed groups as selectable actions", () => {
    assert.deepEqual(
      todayDashboardActions.map((action) => "group" in action ? action.group : null),
      ["newInquiry", "quote", "projectConversion", "overduePayment"],
    );
    assert.deepEqual(todayDashboardActions.map(({ countKey }) => countKey), [
      "newInquiry", "quote", "projectConversion", "overduePayment",
    ]);
  });

  test("requests the selected group and stable API snapshot page", () => {
    const buildUrl: unknown = Reflect.get(todayDashboardModel, "buildAdminWorkItemsUrl");
    assert.equal(typeof buildUrl, "function");
    if (typeof buildUrl !== "function") return;

    assert.equal(
      buildUrl({
        group: "quote",
        page: 2,
        pageSize: 10,
        asOf: "2026-10-10T00:00:00.000Z",
        sort: "waiting",
      }),
      "/api/admin/work-items?page=2&pageSize=10&group=quote&sort=waiting&asOf=2026-10-10T00%3A00%3A00.000Z",
    );
  });

  test("defaults the complete queue to waiting and a group queue to latest", () => {
    const getDefaultSort: unknown = Reflect.get(todayDashboardModel, "getDefaultWorkItemsSort");
    assert.equal(typeof getDefaultSort, "function");
    if (typeof getDefaultSort !== "function") return;
    assert.equal(getDefaultSort("all"), "waiting");
    assert.equal(getDefaultSort("quote"), "latest");
    assert.equal(
      todayDashboardModel.buildAdminWorkItemsUrl({ group: "all" }),
      "/api/admin/work-items?page=1&pageSize=25&group=all&sort=waiting",
    );
    assert.equal(
      todayDashboardModel.buildAdminWorkItemsUrl({ group: "quote" }),
      "/api/admin/work-items?page=1&pageSize=25&group=quote&sort=latest",
    );
  });

  test("changing sort starts a fresh first-page request without carrying the old snapshot", () => {
    const getSortChangeQuery: unknown = Reflect.get(todayDashboardModel, "getWorkItemsSortChangeQuery");
    assert.equal(typeof getSortChangeQuery, "function");
    if (typeof getSortChangeQuery !== "function") return;
    const query = getSortChangeQuery("quote", "waiting") as { group: "quote"; sort: "waiting"; page: number; pageSize: number };
    assert.deepEqual(query, { group: "quote", sort: "waiting", page: 1, pageSize: 25 });
    assert.equal(
      todayDashboardModel.buildAdminWorkItemsUrl(query),
      "/api/admin/work-items?page=1&pageSize=25&group=quote&sort=waiting",
    );
  });

  test("validates API response without inventing or dropping contract fields", () => {
    const parsed = adminWorkItemsResponseSchema.parse({
      asOf: "2026-10-10T00:00:00.000Z",
      group: "all",
      sort: "waiting",
      counts: { total: 1, newInquiry: 1, quote: 0, projectConversion: 0, overduePayment: 0 },
      pagination: { page: 1, pageSize: 25, total: 1, hasNextPage: false },
      items: [{
        id: "inquiry:123", group: "newInquiry", kind: "inquiry", priority: 20,
        waitingSince: "2026-10-09T00:00:00.000Z", latestAt: "2026-10-09T00:00:00.000Z", ageSeconds: 86400, waitingSinceFallback: false,
        entityId: "123", inquiryId: "123", projectId: null, customerName: "고객",
        title: "서비스 문의", status: "new", deliveryStatus: null, attemptCount: null,
        maxAttempts: null, dueDate: null, action: "review_inquiry", deepLink: "/admin/inquiries#inquiry-123",
      }],
    });
    assert.equal(parsed.items[0]?.action, "review_inquiry");
    assert.equal(parsed.counts.newInquiry, 1);
    assert.equal(Reflect.get(parsed, "group"), "all");
    assert.equal(Reflect.get(parsed, "sort"), "waiting");

    const filtered = adminWorkItemsResponseSchema.parse({
      ...parsed,
      group: "quote",
      sort: "latest",
      counts: { total: 12, newInquiry: 4, quote: 3, projectConversion: 2, overduePayment: 3 },
      pagination: { page: 1, pageSize: 25, total: 3, hasNextPage: false },
      items: [],
    });
    assert.equal(filtered.counts.total, 12);
    assert.equal(filtered.counts.quote, filtered.pagination.total);
    assert.equal(filtered.group, "quote");
    assert.equal(filtered.sort, "latest");
  });

  test("fetches the API with no-store and returns its exact snapshot contract", async () => {
    let requestedUrl = "";
    let requestedCache: RequestCache | undefined;
    const payload = {
      data: {
        asOf: "2026-10-10T00:00:00.000Z",
        group: "all",
        sort: "waiting",
        counts: { total: 0, newInquiry: 0, quote: 0, projectConversion: 0, overduePayment: 0 },
        pagination: { page: 1, pageSize: 25, total: 0, hasNextPage: false },
        items: [],
      },
    };
    const data = await fetchAdminWorkItems({ group: "all", page: 1, pageSize: 25 }, async (input, init) => {
      requestedUrl = String(input);
      requestedCache = init?.cache;
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    assert.equal(requestedUrl, "/api/admin/work-items?page=1&pageSize=25&group=all&sort=waiting");
    assert.equal(requestedCache, "no-store");
    assert.deepEqual(data, payload.data);
  });

  test("advances pagination from the newest response and appends only its page", () => {
    const appendPage = Reflect.get(todayDashboardModel, "appendAdminWorkItemsPage") as (
      currentItems: ReturnType<typeof adminWorkItemsResponseSchema.parse>["items"],
      nextPage: ReturnType<typeof adminWorkItemsResponseSchema.parse>,
    ) => { data: ReturnType<typeof adminWorkItemsResponseSchema.parse>; items: ReturnType<typeof adminWorkItemsResponseSchema.parse>["items"] };
    assert.equal(typeof appendPage, "function");
    if (typeof appendPage !== "function") return;

    const previous = adminWorkItemsResponseSchema.parse({
      asOf: "2026-10-10T00:00:00.000Z",
      group: "all",
      sort: "waiting",
      counts: { total: 51, newInquiry: 51, quote: 0, projectConversion: 0, overduePayment: 0 },
      pagination: { page: 1, pageSize: 25, total: 51, hasNextPage: true },
      items: [makeInquiryItem("inquiry:1")],
    });
    const nextPage = adminWorkItemsResponseSchema.parse({
      ...previous,
      pagination: { page: 2, pageSize: 25, total: 51, hasNextPage: true },
      items: [makeInquiryItem("inquiry:26")],
    });
    const merged = appendPage(previous.items, nextPage);
    assert.equal(merged.data.pagination.page, 2);
    assert.equal(merged.data.pagination.hasNextPage, true);
    assert.deepEqual(merged.items.map(({ id }) => id), ["inquiry:1", "inquiry:26"]);
    assert.equal(
      todayDashboardModel.buildAdminWorkItemsUrl({
        group: merged.data.group,
        sort: merged.data.sort,
        page: merged.data.pagination.page + 1,
        pageSize: merged.data.pagination.pageSize,
        asOf: merged.data.asOf,
      }),
      "/api/admin/work-items?page=3&pageSize=25&group=all&sort=waiting&asOf=2026-10-10T00%3A00%3A00.000Z",
    );
  });

  test("labels the current work item status for the list row", () => {
    const getStatusLabel: unknown = Reflect.get(todayDashboardModel, "getWorkItemStatusLabel");
    assert.equal(typeof getStatusLabel, "function");
    if (typeof getStatusLabel !== "function") return;
    assert.equal(getStatusLabel({ group: "quote", kind: "quoteSend", status: "failed", action: "retry_quote" }), "발송 실패");
    assert.equal(getStatusLabel({ group: "projectConversion", kind: "convertApprovedQuote", status: "approved", action: "convert_quote" }), "승인 완료");
  });
});

function makeInquiryItem(id: string) {
  return {
    id, group: "newInquiry", kind: "inquiry", priority: 20,
    waitingSince: "2026-10-09T00:00:00.000Z", latestAt: "2026-10-09T00:00:00.000Z", ageSeconds: 86400, waitingSinceFallback: false,
    entityId: id, inquiryId: id, projectId: null, customerName: "고객",
    title: "서비스 문의", status: "new", deliveryStatus: null, attemptCount: null,
    maxAttempts: null, dueDate: null, action: "review_inquiry", deepLink: `/admin/inquiries#${id}`,
  } as const;
}
