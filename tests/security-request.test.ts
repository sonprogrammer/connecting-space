import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const security = require("../src/shared/lib/security/request-security") as typeof import("../src/shared/lib/security/request-security");
const {
  enforcePublicRequestSecurity,
  enforceCookieMutationSecurity,
  UpstashRateLimitStore,
} = security;
type RateLimitStore = import("../src/shared/lib/security/request-security").RateLimitStore;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy } = require("../src/proxy") as typeof import("../src/proxy");

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost:3000${path}`, init);
}

function store(sequence: number[] | Error): RateLimitStore {
  let index = 0;
  return {
    async increment() {
      if (sequence instanceof Error) throw sequence;
      return sequence[Math.min(index++, sequence.length - 1)] ?? 1;
    },
  };
}

function captureLogs() {
  const records: Array<Record<string, unknown>> = [];
  return {
    records,
    logger: (record: string) => records.push(JSON.parse(record) as Record<string, unknown>),
  };
}

describe("request security contract", () => {
  test("rejects an oversized inquiry before parsing the body", async () => {
    const body = "x".repeat(64 * 1024 + 1);
    const result = await enforcePublicRequestSecurity(
      request("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(body.length) },
        body,
      }),
      { store: store([1]) },
    );

    assert.equal(result?.status, 413);
    assert.deepEqual(await result?.json(), {
      error: { code: "REQUEST_BODY_TOO_LARGE", message: "Request body is too large" },
    });
  });

  test("requires JSON content type for public JSON endpoints", async () => {
    const result = await enforcePublicRequestSecurity(
      request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.test" }) }),
      { store: store([1]) },
    );
    assert.equal(result?.status, 415);
  });

  test("uses hashed dimensions and returns 429 without exposing identifiers", async () => {
    const calls: Array<{ key: string; windowSeconds: number }> = [];
    const result = await enforcePublicRequestSecurity(
      request("/api/inquiries", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.7",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ email: "Customer@Example.test" }),
      }),
      {
        hashSecret: "test-rate-limit-secret",
        store: {
          async increment(key, windowSeconds) {
            calls.push({ key, windowSeconds });
            return 6;
          },
        },
      },
    );

    assert.equal(result?.status, 429);
    assert.equal(calls.length, 1);
    assert.match(calls[0].key, /^inquiry:ip:[0-9a-f]{64}$/);
    assert.equal(calls[0].key.includes("203.0.113.7"), false);
    assert.equal(calls[0].windowSeconds, 60);
    assert.equal((await result?.json()).error.code, "RATE_LIMITED");
  });

  test("fails closed with 503 when Upstash is unavailable", async () => {
    const result = await enforcePublicRequestSecurity(
      request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.test" }),
      }),
      { store: store(new Error("provider unavailable")) },
    );
    assert.equal(result?.status, 503);
    assert.equal((await result?.json()).error.code, "RATE_LIMIT_UNAVAILABLE");
  });

  test("logs a reason without secrets when the hash secret is missing", async () => {
    const captured = captureLogs();
    const result = await enforcePublicRequestSecurity(
      request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "private@example.test" }),
      }),
      { logger: captured.logger },
    );

    assert.equal(result?.status, 503);
    assert.deepEqual(captured.records, [{
      event: "rate_limit_unavailable",
      provider: "upstash",
      reason: "rate_limit_hash_secret_missing",
    }]);
    assert.equal(JSON.stringify(captured.records).includes("private@example.test"), false);
  });

  test("logs missing and invalid Upstash URL configuration distinctly", async () => {
    const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
    const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const captured = captureLogs();
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
    try {
      delete process.env.UPSTASH_REDIS_REST_URL;
      await enforcePublicRequestSecurity(
        request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
        { hashSecret: "test-rate-limit-secret", logger: captured.logger },
      );
      process.env.UPSTASH_REDIS_REST_URL = "https://evil.example/secret-path";
      await enforcePublicRequestSecurity(
        request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
        { hashSecret: "test-rate-limit-secret", logger: captured.logger },
      );
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = previousUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    }

    assert.deepEqual(captured.records.map(({ reason }) => reason), [
      "upstash_url_missing",
      "upstash_url_invalid",
    ]);
    assert.equal(JSON.stringify(captured.records).includes("evil.example"), false);
    assert.equal(JSON.stringify(captured.records).includes("secret-path"), false);
  });

  test("logs fetch, HTTP, and pipeline failures with safe reason codes", async () => {
    const cases = [
      { response: null, reason: "upstash_fetch_failed" },
      { response: new Response("", { status: 429 }), reason: "upstash_http_error" },
      { response: new Response(JSON.stringify([{ result: 1 }, { error: "private provider error" }]), { status: 200 }), reason: "upstash_pipeline_command_error" },
    ];
    const previousFetch = globalThis.fetch;
    const captured = captureLogs();
    try {
      for (const current of cases) {
        globalThis.fetch = (async () => {
          if (current.response === null) throw new Error("private network detail");
          return current.response.clone();
        }) as typeof fetch;
        const result = await enforcePublicRequestSecurity(
          request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
          {
            hashSecret: "test-rate-limit-secret",
            store: new UpstashRateLimitStore("https://test.upstash.io", "secret-token"),
            logger: captured.logger,
          },
        );
        assert.equal(result?.status, 503);
      }
    } finally {
      globalThis.fetch = previousFetch;
    }

    assert.deepEqual(captured.records.map(({ reason }) => reason), [
      "upstash_fetch_failed",
      "upstash_http_error",
      "upstash_pipeline_command_error",
    ]);
    assert.equal(captured.records[1].status, 429);
    const serialized = JSON.stringify(captured.records);
    assert.equal(serialized.includes("private network detail"), false);
    assert.equal(serialized.includes("private provider error"), false);
    assert.equal(serialized.includes("secret-token"), false);
  });

  test("requires an allowed Origin for cookie mutations", async () => {
    const result = await enforceCookieMutationSecurity(
      request("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: "{}",
      }),
      { allowedOrigins: ["http://localhost:3000"] },
    );
    assert.equal(result?.status, 403);
  });

  test("does not require Content-Type for bodyless admin mutations", async () => {
    const result = await enforceCookieMutationSecurity(
      request("/api/admin/inquiries/00000000-0000-4000-8000-000000000001/reply-draft/regenerate", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }),
      { allowedOrigins: ["http://localhost:3000"] },
    );
    assert.equal(result, null);
  });

  test("requires JSON Content-Type for JSON-body admin mutations", async () => {
    const result = await enforceCookieMutationSecurity(
      request("/api/admin/customers", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: "{}",
      }),
      { allowedOrigins: ["http://localhost:3000"] },
    );
    assert.equal(result?.status, 415);
  });

  test("sends only hashed keys through the Upstash pipeline", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 });
    }) as typeof fetch;
    try {
      const count = await new UpstashRateLimitStore("https://test.upstash.io", "secret-token").increment("login:ip:abc", 600);
      assert.equal(count, 1);
      assert.equal(capturedUrl, "https://test.upstash.io/pipeline");
      assert.equal(String(capturedInit?.headers && new Headers(capturedInit.headers).get("authorization")), "Bearer secret-token");
      assert.match(String(capturedInit?.body), /login:ip:abc/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("fails closed when one Upstash pipeline command returns an error", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(
      JSON.stringify([{ result: 1 }, { error: "EXPIRE command failed" }]),
      { status: 200 },
    )) as typeof fetch;
    try {
      const result = await enforcePublicRequestSecurity(
        request("/api/inquiries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "a@b.test" }),
        }),
        {
          hashSecret: "test-rate-limit-secret",
          store: new UpstashRateLimitStore("https://test.upstash.io", "secret-token"),
        },
      );
      assert.equal(result?.status, 503);
      assert.equal((await result?.json()).error.code, "RATE_LIMIT_UNAVAILABLE");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("fails closed when the Upstash pipeline shape is incomplete or malformed", async () => {
    for (const pipeline of [
      [{ result: 1 }],
      [{ result: 1 }, {}],
      [{ result: 1 }, { result: "1" }],
      [{ result: 1 }, { result: 0 }],
    ]) {
      const previousFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response(JSON.stringify(pipeline), { status: 200 })) as typeof fetch;
      try {
        const result = await enforcePublicRequestSecurity(
          request("/api/inquiries", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "a@b.test" }),
          }),
          {
            hashSecret: "test-rate-limit-secret",
            store: new UpstashRateLimitStore("https://test.upstash.io", "secret-token"),
          },
        );
        assert.equal(result?.status, 503);
      } finally {
        globalThis.fetch = previousFetch;
      }
    }
  });

  test("applies the contract at the Next proxy boundary", async () => {
    const previous = {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      hash: process.env.RATE_LIMIT_HASH_SECRET,
      origins: process.env.CSRF_ALLOWED_ORIGINS,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      fetch: globalThis.fetch,
    };
    process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    process.env.RATE_LIMIT_HASH_SECRET = "test-rate-limit-secret";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    delete process.env.CSRF_ALLOWED_ORIGINS;
    globalThis.fetch = (async () => new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 })) as typeof fetch;
    try {
      const allowed = await proxy(new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }));
      assert.equal(allowed.status, 200);
      const rejected = await proxy(new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }));
      assert.equal(rejected.status, 403);
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = previous.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = previous.token;
      process.env.RATE_LIMIT_HASH_SECRET = previous.hash;
      process.env.CSRF_ALLOWED_ORIGINS = previous.origins;
      process.env.NEXT_PUBLIC_APP_URL = previous.appUrl;
      globalThis.fetch = previous.fetch;
    }
  });
});
