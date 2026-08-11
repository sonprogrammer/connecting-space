import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  requestAdminLogin,
  submitAdminLogin,
  type AdminLoginFetcher,
} from "../src/features/admin-login/model/admin-login";

describe("admin login request", () => {
  test("posts credentials as JSON without putting the password in the URL", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetcher: AdminLoginFetcher = async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(
        JSON.stringify({
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "admin@example.com",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await requestAdminLogin(
      { email: "admin@example.com", password: "secret-password" },
      fetcher,
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(requestedUrl, "/api/auth/login");
    assert.equal(requestedInit?.method, "POST");
    assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
      email: "admin@example.com",
      password: "secret-password",
    });
    assert.equal(requestedUrl.includes("secret-password"), false);
    assert.equal(requestedUrl.includes("password="), false);
  });

  test("returns a safe failure message for invalid credentials", async () => {
    const fetcher: AdminLoginFetcher = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "LOGIN_FAILED",
            message: "Invalid email or password",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );

    assert.deepEqual(
      await requestAdminLogin(
        { email: "admin@example.com", password: "wrong-password" },
        fetcher,
      ),
      {
        ok: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      },
    );
  });

  test("returns a retryable message when the network request fails", async () => {
    const fetcher: AdminLoginFetcher = async () => {
      throw new Error("offline");
    };

    assert.deepEqual(
      await requestAdminLogin(
        { email: "admin@example.com", password: "secret-password" },
        fetcher,
      ),
      {
        ok: false,
        message: "로그인 중 네트워크 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      },
    );
  });

  test("moves to the admin dashboard only after a successful login", async () => {
    const destinations: string[] = [];
    const fetcher: AdminLoginFetcher = async () =>
      new Response(
        JSON.stringify({
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "admin@example.com",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const result = await submitAdminLogin(
      { email: "admin@example.com", password: "secret-password" },
      (destination) => destinations.push(destination),
      fetcher,
    );

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(destinations, ["/admin"]);
  });
});
