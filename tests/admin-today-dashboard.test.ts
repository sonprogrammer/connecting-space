import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { InfiniteQueryObserver } from "@tanstack/query-core";
import { QueryClient } from "@tanstack/react-query";

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

describe("admin work items query cache", () => {
  test("separates query keys by group, sort, and page size", () => {
    const keyFactory = Reflect.get(todayDashboardModel, "adminWorkItemsQueryKeys") as {
      list: (query: { group: string; sort: string; pageSize: number }) => readonly unknown[];
    } | undefined;
    assert.ok(keyFactory);
    const base = keyFactory.list({ group: "all", sort: "waiting", pageSize: 25 });
    assert.deepEqual(base, keyFactory.list({ group: "all", sort: "waiting", pageSize: 25 }));
    assert.notDeepEqual(base, keyFactory.list({ group: "quote", sort: "waiting", pageSize: 25 }));
    assert.notDeepEqual(base, keyFactory.list({ group: "all", sort: "latest", pageSize: 25 }));
    assert.notDeepEqual(base, keyFactory.list({ group: "all", sort: "waiting", pageSize: 10 }));
  });

  test("reuses query A after visiting B within the 30-second stale window", async () => {
    const createOptions = getWorkItemsQueryOptionsFactory();
    const requestUrls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      requestUrls.push(String(input));
      const url = new URL(String(input), "http://localhost");
      return jsonResponse({
        data: makeWorkItemsResponse({
          group: url.searchParams.get("group") ?? "all",
          sort: url.searchParams.get("sort") ?? "waiting",
          page: Number(url.searchParams.get("page") ?? 1),
          items: [],
          total: 0,
          hasNextPage: false,
        }),
      });
    };
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    const queryA = createOptions({ group: "all", sort: "waiting", pageSize: 25 }, fetcher);
    const queryB = createOptions({ group: "quote", sort: "latest", pageSize: 25 }, fetcher);

    try {
      await client.fetchInfiniteQuery(queryA as never);
      await client.fetchInfiniteQuery(queryB as never);
      await client.fetchInfiniteQuery(queryA as never);
      assert.equal(requestUrls.length, 2);
      assert.equal(requestUrls.filter((url) => url.includes("group=all")).length, 1);
      assert.equal(requestUrls.filter((url) => url.includes("group=quote")).length, 1);
    } finally {
      client.clear();
    }
  });

  test("keeps one asOf across 51 ordered items and distinguishes total from loaded count", async () => {
    const createOptions = getWorkItemsQueryOptionsFactory();
    const requestUrls: string[] = [];
    const pages = [
      makeWorkItemsResponse({ group: "quote", sort: "latest", page: 1, items: ids(1, 25).map(makeInquiryItem), total: 51, hasNextPage: true, countsTotal: 90 }),
      makeWorkItemsResponse({ group: "quote", sort: "latest", page: 2, items: ids(26, 50).map(makeInquiryItem), total: 51, hasNextPage: true, countsTotal: 90 }),
      makeWorkItemsResponse({ group: "quote", sort: "latest", page: 3, items: ids(51, 51).map(makeInquiryItem), total: 51, hasNextPage: false, countsTotal: 90 }),
    ];
    const fetcher: typeof fetch = async (input) => {
      requestUrls.push(String(input));
      const url = new URL(String(input), "http://localhost");
      const page = Number(url.searchParams.get("page"));
      return jsonResponse({ data: pages[page - 1] });
    };
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
    const options = createOptions({ group: "quote", sort: "latest", pageSize: 25 }, fetcher);
    const observer = new InfiniteQueryObserver(client, options as never);

    try {
      await observer.refetch();
      await observer.fetchNextPage();
      const twoPageData = observer.getCurrentResult().data as { pages: typeof pages } | undefined;
      assert.ok(twoPageData);
      assert.equal(getWorkItemsCount("getAdminWorkItemsLoadedCount")(twoPageData.pages), 50);
      assert.equal(getWorkItemsCount("getAdminWorkItemsTotal")(twoPageData.pages.at(-1)), 51);
      await observer.fetchNextPage();
      const result = observer.getCurrentResult();
      const data = result.data as { pages: typeof pages } | undefined;
      assert.ok(data);
      const loadedItems = data.pages.flatMap((page) => page.items);
      assert.equal(loadedItems.length, 51);
      assert.equal(new Set(loadedItems.map((item) => item.id)).size, 51);
      assert.deepEqual(loadedItems.map((item) => item.id), ids(1, 51));
      assert.equal(getWorkItemsCount("getAdminWorkItemsLoadedCount")(data.pages), 51);
      assert.equal(getWorkItemsCount("getAdminWorkItemsTotal")(data.pages.at(-1)), 51);
      assert.equal(requestUrls.length, 3);
      assert.deepEqual(requestUrls.map((url) => new URL(url, "http://localhost").searchParams.get("page")), ["1", "2", "3"]);
      assert.deepEqual(requestUrls.map((url) => new URL(url, "http://localhost").searchParams.get("asOf")), [null, pages[0]?.asOf, pages[0]?.asOf]);
      assert.equal(result.hasNextPage, false);
    } finally {
      observer.destroy();
      client.clear();
    }
  });
});

function getWorkItemsQueryOptionsFactory() {
  const factory = Reflect.get(todayDashboardModel, "adminWorkItemsInfiniteQueryOptions") as (
    query: { group: string; sort: string; pageSize: number },
    fetcher?: typeof fetch,
  ) => object;
  assert.equal(typeof factory, "function");
  return factory;
}

function getWorkItemsCount(name: string) {
  const helper = Reflect.get(todayDashboardModel, name) as (pages: unknown) => number;
  assert.equal(typeof helper, "function");
  return helper;
}

function ids(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => `inquiry:${start + index}`);
}

function makeWorkItemsResponse({
  group,
  sort,
  page,
  items,
  total,
  hasNextPage,
  countsTotal = total,
}: {
  group: string;
  sort: string;
  page: number;
  items: ReturnType<typeof makeInquiryItem>[];
  total: number;
  hasNextPage: boolean;
  countsTotal?: number;
}) {
  return {
    asOf: "2026-10-10T00:00:00.000Z",
    group,
    sort,
    counts: { total: countsTotal, newInquiry: 0, quote: 31, projectConversion: 0, overduePayment: 0 },
    pagination: { page, pageSize: 25, total, hasNextPage },
    items,
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function makeInquiryItem(id: string) {
  return {
    id, group: "newInquiry", kind: "inquiry", priority: 20,
    waitingSince: "2026-10-09T00:00:00.000Z", latestAt: "2026-10-09T00:00:00.000Z", ageSeconds: 86400, waitingSinceFallback: false,
    entityId: id, inquiryId: id, projectId: null, customerName: "고객",
    title: "서비스 문의", status: "new", deliveryStatus: null, attemptCount: null,
    maxAttempts: null, dueDate: null, action: "review_inquiry", deepLink: `/admin/inquiries#${id}`,
  } as const;
}
