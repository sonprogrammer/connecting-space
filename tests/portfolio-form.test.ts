import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildPortfolioPayload,
  emptyPortfolioForm,
  portfolioToFormValues,
} from "../src/features/manage-portfolio/model/portfolio-form";

describe("portfolio form", () => {
  test("builds a normalized API payload from editable form strings", () => {
    assert.deepEqual(
      buildPortfolioPayload({
        projectId: "",
        title: "  필라테스 스튜디오  ",
        slug: "  pilates-studio  ",
        summary: "  예약 전환 사이트  ",
        imageUrl: "",
        siteUrl: "  https://example.com  ",
        industry: " 피트니스 ",
        isPublished: true,
        sortOrder: "2",
      }),
      {
        projectId: null,
        title: "필라테스 스튜디오",
        slug: "pilates-studio",
        summary: "예약 전환 사이트",
        imageUrl: "",
        siteUrl: "https://example.com",
        industry: "피트니스",
        isPublished: true,
        sortOrder: 2,
      },
    );
  });

  test("uses zero when the sort order field is empty", () => {
    assert.equal(
      buildPortfolioPayload({ ...emptyPortfolioForm, sortOrder: "" })
        .sortOrder,
      0,
    );
  });

  test("maps an API row to editable strings", () => {
    const values = portfolioToFormValues({
      id: "11111111-1111-4111-8111-111111111111",
      project_id: null,
      title: "필라테스 스튜디오",
      slug: "pilates-studio",
      summary: null,
      image_url: null,
      site_url: null,
      industry: null,
      is_published: false,
      published_at: null,
      sort_order: 0,
      created_at: "2026-08-06T00:00:00.000Z",
      updated_at: "2026-08-06T00:00:00.000Z",
    });

    assert.equal(values.sortOrder, "0");
    assert.equal(values.projectId, "");
    assert.equal(values.summary, "");
    assert.equal(values.imageUrl, "");
    assert.equal(values.siteUrl, "");
    assert.equal(values.industry, "");
  });
});
