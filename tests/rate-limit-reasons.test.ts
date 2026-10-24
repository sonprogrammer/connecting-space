import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enforcePublicRequestSecurity, UpstashRateLimitStore } = require("../src/shared/lib/security/request-security") as typeof import("../src/shared/lib/security/request-security");

const sensitive = "private-token private@example.test 203.0.113.9 https://secret.upstash.io";
const cases = [
  { name: "JSON parsing", body: sensitive, reason: "upstash_json_parse_failed" },
  { name: "command error", body: JSON.stringify([{ result: 1 }, { error: sensitive }]), reason: "upstash_pipeline_command_error" },
  { name: "missing entry", body: '[{"result":1}]', reason: "upstash_pipeline_response_invalid" },
  { name: "invalid entry", body: '[{"result":1},{}]', reason: "upstash_pipeline_response_invalid" },
  { name: "invalid counter", body: '[{"result":0},{"result":1}]', reason: "upstash_pipeline_response_invalid" },
  { name: "expiry mismatch", body: '[{"result":1},{"result":0}]', reason: "upstash_expire_result_mismatch" },
  { name: "internal error", body: "", reason: "rate_limit_internal_error", internal: true },
];

for (const current of cases) {
  test(`logs ${current.name} safely and preserves 503`, async () => {
    const logs: string[] = [];
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response(current.body));
    try {
      const response = await enforcePublicRequestSecurity(new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ email: "private@example.test" }),
      }), {
        hashSecret: "private-hash-secret",
        store: current.internal
          ? { async increment() { throw new Error(sensitive); } }
          : new UpstashRateLimitStore("https://secret.upstash.io", "private-token"),
        logger: (record) => logs.push(record),
      });
      assert.equal(response?.status, 503);
      assert.equal(response?.headers.get("Retry-After"), "30");
      assert.equal((await response?.json()).error.code, "RATE_LIMIT_UNAVAILABLE");
      assert.deepEqual(logs.map((entry) => JSON.parse(entry)), [{
        event: "rate_limit_unavailable", provider: "upstash", reason: current.reason,
        ...(current.reason === "upstash_pipeline_command_error"
          ? { command_errors: [{ command: "expire", error_type: "unknown" }] }
          : {}),
      }]);
      for (const value of [...sensitive.split(" "), "private-hash-secret"]) {
        assert.equal(logs.join("").includes(value), false);
      }
    } finally {
      fetchMock.mock.restore();
    }
  });
}
