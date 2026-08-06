import assert from "node:assert/strict";
import { after, before, describe, mock, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import type { Database } from "../src/shared/types/database.generated";
import { registerPathAlias } from "./helpers/register-path-alias";

type PublicPortfolioRoute = typeof import("../src/app/api/portfolio/route");
type AdminPortfolioRoute =
  typeof import("../src/app/api/admin/portfolio/route");
type AdminPortfolioDetailRoute =
  typeof import("../src/app/api/admin/portfolio/[id]/route");

type VerifiedAdminResult =
  | { ok: true; supabase: SupabaseClient<Database> }
  | { ok: false; response: NextResponse };

type CapturedRequest = {
  url: string;
  method: string;
  body: string;
};

const portfolioId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-01T00:00:00.000Z";
const publishedAt = "2026-08-02T00:00:00.000Z";

const portfolioRow: Database["public"]["Tables"]["portfolio_items"]["Row"] = {
  id: portfolioId,
  project_id: null,
  title: "필라테스 스튜디오",
  slug: "pilates-studio",
  summary: "예약 전환 중심의 아임웹 사이트",
  image_url: "https://example.com/pilates.jpg",
  site_url: "https://example.com",
  industry: "피트니스",
  is_published: false,
  published_at: null,
  sort_order: 0,
  created_at: createdAt,
  updated_at: createdAt,
};

let publicRoute: PublicPortfolioRoute;
let adminPortfolioRoute: AdminPortfolioRoute;
let adminPortfolioDetailRoute: AdminPortfolioDetailRoute;
let publicClient: SupabaseClient<Database> | undefined;
let verifiedAdmin: VerifiedAdminResult | undefined;

before(() => {
  registerPathAlias();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serverModule = require("../src/shared/lib/supabase/server") as typeof import("../src/shared/lib/supabase/server");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminApiModule = require("../src/shared/lib/auth/admin-api") as typeof import("../src/shared/lib/auth/admin-api");

  mock.method(serverModule, "createSupabaseServerClient", () => {
    assert.ok(publicClient, "public Supabase client must be configured");
    return publicClient;
  });
  mock.method(adminApiModule, "getVerifiedAdminSupabase", async () => {
    assert.ok(verifiedAdmin, "admin verification result must be configured");
    return verifiedAdmin;
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  publicRoute = require("../src/app/api/portfolio/route") as PublicPortfolioRoute;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  adminPortfolioRoute = require("../src/app/api/admin/portfolio/route") as AdminPortfolioRoute;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  adminPortfolioDetailRoute = require("../src/app/api/admin/portfolio/[id]/route") as AdminPortfolioDetailRoute;
});

after(() => {
  mock.restoreAll();
});

describe("public portfolio API", () => {
  test("returns only the selected published fields in the required order", async () => {
    const publicItem = {
      id: portfolioRow.id,
      title: portfolioRow.title,
      slug: portfolioRow.slug,
      summary: portfolioRow.summary,
      image_url: portfolioRow.image_url,
      site_url: portfolioRow.site_url,
      industry: portfolioRow.industry,
      published_at: publishedAt,
    };
    const fake = createTestSupabase([postgrestResponse([publicItem])]);
    publicClient = fake.client;

    const response = await publicRoute.GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { data: [publicItem] });
    assert.equal(fake.requests.length, 1);

    const url = new URL(fake.requests[0].url);
    assert.equal(url.pathname, "/rest/v1/portfolio_items");
    assert.equal(
      url.searchParams.get("select"),
      "id,title,slug,summary,image_url,site_url,industry,published_at",
    );
    assert.equal(url.searchParams.get("is_published"), "eq.true");
    assert.equal(
      url.searchParams.get("order"),
      "sort_order.asc,published_at.desc,created_at.desc",
    );
    assert.equal(url.searchParams.get("limit"), "100");
  });

  test("does not expose a Supabase error message", async () => {
    const fake = createTestSupabase([
      postgrestError(
        "XX000",
        "relation public.portfolio_items does not exist",
        500,
      ),
    ]);
    publicClient = fake.client;

    const response = await publicRoute.GET();
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, {
      error: {
        code: "PUBLIC_PORTFOLIO_READ_FAILED",
        message: "Failed to read public portfolio items",
      },
    });
  });
});

describe("admin portfolio API", () => {
  test("rejects an unauthenticated collection request", async () => {
    verifiedAdmin = {
      ok: false,
      response: NextResponse.json(
        { error: { code: "ADMIN_AUTH_REQUIRED", message: "Login required" } },
        { status: 401 },
      ),
    };

    const response = await adminPortfolioRoute.GET(
      new NextRequest("http://localhost/api/admin/portfolio"),
    );

    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "ADMIN_AUTH_REQUIRED");
  });

  test("lists all items in admin order with the configured limit", async () => {
    const fake = createTestSupabase([postgrestResponse([portfolioRow])]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioRoute.GET(
      new NextRequest("http://localhost/api/admin/portfolio"),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [portfolioRow] });

    const url = new URL(fake.requests[0].url);
    assert.equal(url.searchParams.get("select"), "*");
    assert.equal(
      url.searchParams.get("order"),
      "sort_order.asc,updated_at.desc",
    );
    assert.equal(url.searchParams.get("limit"), "100");
  });

  test("creates a private item with server defaults and null optional fields", async () => {
    const fake = createTestSupabase([postgrestResponse(portfolioRow, 201)]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioRoute.POST(
      jsonRequest("http://localhost/api/admin/portfolio", "POST", {
        title: portfolioRow.title,
        slug: portfolioRow.slug,
        summary: "",
        imageUrl: "",
        siteUrl: "",
        industry: "",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(body, { data: portfolioRow });

    const insert = JSON.parse(fake.requests[0].body);
    assert.equal(insert.project_id, null);
    assert.equal(insert.summary, null);
    assert.equal(insert.image_url, null);
    assert.equal(insert.site_url, null);
    assert.equal(insert.industry, null);
    assert.equal(insert.is_published, false);
    assert.equal(insert.published_at, null);
    assert.equal(insert.sort_order, 0);
  });

  test("returns 400 when a linked project does not exist", async () => {
    const fake = createTestSupabase([postgrestResponse([])]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioRoute.POST(
      jsonRequest("http://localhost/api/admin/portfolio", "POST", {
        projectId,
        title: portfolioRow.title,
        slug: portfolioRow.slug,
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_PORTFOLIO_PROJECT",
    );
    assert.equal(fake.requests.length, 1);
  });

  test("maps a duplicate slug to 409", async () => {
    const fake = createTestSupabase([
      postgrestError("23505", "duplicate key value", 409),
    ]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioRoute.POST(
      jsonRequest("http://localhost/api/admin/portfolio", "POST", {
        title: portfolioRow.title,
        slug: portfolioRow.slug,
      }),
    );

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "PORTFOLIO_SLUG_CONFLICT",
    );
  });

  test("maps a project foreign-key race to 400", async () => {
    const fake = createTestSupabase([
      postgrestResponse([{ id: projectId }]),
      postgrestError("23503", "foreign key violation", 409),
    ]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioRoute.POST(
      jsonRequest("http://localhost/api/admin/portfolio", "POST", {
        projectId,
        title: portfolioRow.title,
        slug: portfolioRow.slug,
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(
      (await response.json()).error.code,
      "INVALID_PORTFOLIO_PROJECT",
    );
  });

  test("returns 404 for a missing portfolio detail", async () => {
    const fake = createTestSupabase([postgrestResponse([])]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioDetailRoute.GET(
      new NextRequest(`http://localhost/api/admin/portfolio/${portfolioId}`),
      { params: Promise.resolve({ id: portfolioId }) },
    );

    assert.equal(response.status, 404);
    assert.equal(
      (await response.json()).error.code,
      "ADMIN_PORTFOLIO_NOT_FOUND",
    );
  });

  test("returns 404 instead of updating a missing portfolio item", async () => {
    const fake = createTestSupabase([postgrestResponse([])]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioDetailRoute.PATCH(
      jsonRequest(
        `http://localhost/api/admin/portfolio/${portfolioId}`,
        "PATCH",
        { title: "수정 제목" },
      ),
      { params: Promise.resolve({ id: portfolioId }) },
    );

    assert.equal(response.status, 404);
    assert.equal(
      (await response.json()).error.code,
      "ADMIN_PORTFOLIO_NOT_FOUND",
    );
    assert.equal(fake.requests.length, 1);
  });

  test("does not overwrite publication fields for a title-only patch", async () => {
    const existing = {
      ...portfolioRow,
      is_published: true,
      published_at: publishedAt,
    };
    const updated = { ...existing, title: "수정 제목" };
    const fake = createTestSupabase([
      postgrestResponse([existing]),
      postgrestResponse(updated),
    ]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioDetailRoute.PATCH(
      jsonRequest(
        `http://localhost/api/admin/portfolio/${portfolioId}`,
        "PATCH",
        { title: updated.title },
      ),
      { params: Promise.resolve({ id: portfolioId }) },
    );

    assert.equal(response.status, 200);
    const update = JSON.parse(fake.requests[1].body);
    assert.equal(update.title, updated.title);
    assert.equal("is_published" in update, false);
    assert.equal("published_at" in update, false);
    assert.equal(typeof update.updated_at, "string");
  });

  test("publishes and normalizes empty optional fields in one patch", async () => {
    const updated = {
      ...portfolioRow,
      is_published: true,
      published_at: "2026-08-06T10:00:00.000Z",
      summary: null,
      image_url: null,
      site_url: null,
      industry: null,
    };
    const fake = createTestSupabase([
      postgrestResponse([portfolioRow]),
      postgrestResponse(updated),
    ]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioDetailRoute.PATCH(
      jsonRequest(
        `http://localhost/api/admin/portfolio/${portfolioId}`,
        "PATCH",
        {
          isPublished: true,
          summary: "",
          imageUrl: "",
          siteUrl: "",
          industry: "",
        },
      ),
      { params: Promise.resolve({ id: portfolioId }) },
    );

    assert.equal(response.status, 200);
    const update = JSON.parse(fake.requests[1].body);
    assert.equal(update.is_published, true);
    assert.match(update.published_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(update.summary, null);
    assert.equal(update.image_url, null);
    assert.equal(update.site_url, null);
    assert.equal(update.industry, null);
  });

  test("maps a duplicate slug during patch to 409", async () => {
    const fake = createTestSupabase([
      postgrestResponse([portfolioRow]),
      postgrestError("23505", "duplicate key value", 409),
    ]);
    setVerifiedAdminClient(fake.client);

    const response = await adminPortfolioDetailRoute.PATCH(
      jsonRequest(
        `http://localhost/api/admin/portfolio/${portfolioId}`,
        "PATCH",
        { slug: "duplicate-slug" },
      ),
      { params: Promise.resolve({ id: portfolioId }) },
    );

    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.code,
      "PORTFOLIO_SLUG_CONFLICT",
    );
  });
});

function setVerifiedAdminClient(client: SupabaseClient<Database>) {
  verifiedAdmin = { ok: true, supabase: client };
}

function jsonRequest(url: string, method: "POST" | "PATCH", body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createTestSupabase(responses: Response[]) {
  const requests: CapturedRequest[] = [];
  const pendingResponses = [...responses];
  const fetchStub: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
    });

    const response = pendingResponses.shift();
    assert.ok(response, `Unexpected Supabase request: ${request.method} ${request.url}`);
    return response;
  };
  const client = createClient<Database>("http://supabase.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });

  return { client, requests };
}

function postgrestResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function postgrestError(code: string, message: string, status: number) {
  return postgrestResponse({ code, message, details: null, hint: null }, status);
}
