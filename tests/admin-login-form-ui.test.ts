import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminLoginFormView } from "../src/features/admin-login/ui/admin-login-form-view";

describe("admin login form UI", () => {
  test("uses POST semantics and never declares a query-string form action", () => {
    const html = renderToStaticMarkup(
      createElement(AdminLoginFormView, {
        email: "admin@example.com",
        password: "secret-password",
        onEmailChange: () => undefined,
        onPasswordChange: () => undefined,
        onSubmit: () => undefined,
        isSubmitting: false,
        errorMessage: null,
      }),
    );

    assert.match(html, /method="post"/);
    assert.doesNotMatch(html, /action="\/admin"/);
    assert.doesNotMatch(html, /secret-password.*[?&]password=/);
    assert.match(html, /autoComplete="email"/);
    assert.match(html, /autoComplete="current-password"/);
  });

  test("disables every credential control and shows an error while submitting", () => {
    const html = renderToStaticMarkup(
      createElement(AdminLoginFormView, {
        email: "admin@example.com",
        password: "secret-password",
        onEmailChange: () => undefined,
        onPasswordChange: () => undefined,
        onSubmit: () => undefined,
        isSubmitting: true,
        errorMessage: "이메일 또는 비밀번호가 올바르지 않습니다.",
      }),
    );

    assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
    assert.match(html, /로그인 중/);
    assert.match(html, /role="alert"/);
    assert.match(html, /이메일 또는 비밀번호가 올바르지 않습니다\./);
  });
});
