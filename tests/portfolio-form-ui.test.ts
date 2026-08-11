import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  emptyPortfolioForm,
  PortfolioForm,
} from "../src/features/manage-portfolio";

describe("portfolio form UI", () => {
  test("connects every editable field with a visible label", () => {
    const html = renderToStaticMarkup(createElement(PortfolioForm, {
      value: emptyPortfolioForm,
      onChange: () => undefined,
      onSubmit: () => undefined,
      disabled: false,
      submitLabel: "포트폴리오 만들기",
      fieldErrors: {},
    }));

    for (const fieldId of [
      "portfolio-title",
      "portfolio-slug",
      "portfolio-summary",
      "portfolio-image-url",
      "portfolio-site-url",
      "portfolio-industry",
      "portfolio-project-id",
      "portfolio-sort-order",
      "portfolio-published",
    ]) {
      assert.match(html, new RegExp(`for="${fieldId}"`));
      assert.match(html, new RegExp(`id="${fieldId}"`));
    }
  });

  test("shows field errors and disables controls while saving", () => {
    const html = renderToStaticMarkup(createElement(PortfolioForm, {
      value: emptyPortfolioForm,
      onChange: () => undefined,
      onSubmit: () => undefined,
      disabled: true,
      submitLabel: "저장",
      fieldErrors: { slug: ["이미 사용 중인 slug입니다."] },
    }));

    assert.match(html, /이미 사용 중인 slug입니다\./);
    assert.match(html, /저장 중/);
    assert.match(html, /disabled=""/);
  });
});
