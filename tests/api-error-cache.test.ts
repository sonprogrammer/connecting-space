import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
import { registerPathAlias } from "./helpers/register-path-alias";
import { jsonError, jsonOk } from "../src/shared/api/response";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inquiryRoute = require("../src/app/api/admin/inquiries/route") as typeof import("../src/app/api/admin/inquiries/route");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionRoute = require("../src/app/api/auth/session/route") as typeof import("../src/app/api/auth/session/route");

for (const [path, route] of [
  ["/api/admin/inquiries", inquiryRoute],
  ["/api/auth/session", sessionRoute],
] as const) {
  test(`cookie-less GET ${path} returns an uncached 401 without upstream calls`, async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected upstream call"); });
    try {
      const response = await route.GET(new NextRequest(`http://localhost${path}`));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal((await response.json()).error.code, "ADMIN_AUTH_REQUIRED");
      assert.equal(fetchMock.mock.callCount(), 0);
    } finally {
      fetchMock.mock.restore();
    }
  });
}

for (const status of [400, 403, 404, 409, 413, 415, 429, 500, 503]) {
  test(`shared ${status} error is no-store and retains other headers`, async () => {
    const response = jsonError("SAFE_ERROR", "Safe message", status, { field: "invalid" }, {
      "Cache-Control": "public, max-age=60",
      "Retry-After": "30",
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Retry-After"), "30");
    assert.deepEqual(await response.json(), { error: {
      code: "SAFE_ERROR", message: "Safe message", details: { field: "invalid" },
    } });
  });
}

test("successful response cache policy stays caller-controlled", () => {
  assert.equal(jsonOk({ ok: true }).headers.get("Cache-Control"), null);
  assert.equal(jsonOk([], { headers: { "Cache-Control": "public, max-age=60" } }).headers.get("Cache-Control"), "public, max-age=60");
});
