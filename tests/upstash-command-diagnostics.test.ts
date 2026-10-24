import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enforcePublicRequestSecurity, UpstashRateLimitStore } = require("../src/shared/lib/security/request-security") as typeof import("../src/shared/lib/security/request-security");

const privateText = "secret-key https://private.upstash.io private-token private@example.test 203.0.113.8";
const errors = [
  ["ERR value is not an integer or out of range", "integer_or_range"],
  [`WRONGTYPE ${privateText}`, "wrong_type"],
  [`NOPERM ${privateText}`, "permission_denied"],
  [`NOAUTH ${privateText}`, "authentication_required"],
  [`READONLY ${privateText}`, "read_only"],
  [`OOM ${privateText}`, "out_of_memory"],
  [privateText, "unknown"],
  [{ message: privateText }, "unknown"],
] as const;

for (const index of [0, 1]) {
  for (const [error, errorType] of errors) {
    test(`command ${index} classifies ${errorType} safely and returns 503`, async () => {
      const pipeline: unknown[] = [{ result: 1 }, { result: 1 }];
      pipeline[index] = { error };
      await verify(pipeline, [{ command: index === 0 ? "incr" : "expire", error_type: errorType }]);
    });
  }
}

test("reports both failed commands in order", async () => {
  await verify([{ error: privateText }, { error: `NOPERM ${privateText}` }], [
    { command: "incr", error_type: "unknown" },
    { command: "expire", error_type: "permission_denied" },
  ]);
});

async function verify(pipeline: unknown[], commandErrors: unknown[]) {
  const logs: string[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(pipeline)));
  try {
    const response = await enforcePublicRequestSecurity(new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
      body: JSON.stringify({ email: "private@example.test" }),
    }), {
      hashSecret: "private-hash-secret",
      store: new UpstashRateLimitStore("https://private.upstash.io", "private-token"),
      logger: (record) => logs.push(record),
    });
    assert.equal(response?.status, 503);
    assert.equal(response?.headers.get("Retry-After"), "30");
    assert.equal((await response?.json()).error.code, "RATE_LIMIT_UNAVAILABLE");
    assert.deepEqual(logs.map((entry) => JSON.parse(entry)), [{
      event: "rate_limit_unavailable", provider: "upstash", reason: "upstash_pipeline_command_error",
      command_errors: commandErrors,
    }]);
    for (const value of [...privateText.split(" "), "private-hash-secret", JSON.stringify(pipeline)]) {
      assert.equal(logs.join("").includes(value), false);
    }
  } finally {
    fetchMock.mock.restore();
  }
}
