import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createPortfolioSchema,
  resolvePublishedAt,
  updatePortfolioSchema,
} from "../src/entities/portfolio";

const validInput = {
  projectId: "11111111-1111-4111-8111-111111111111",
  title: "필라테스 스튜디오",
  slug: "pilates-studio",
  summary: "예약 전환 중심의 아임웹 사이트",
  imageUrl: "https://example.com/portfolio/pilates.jpg",
  siteUrl: "http://example.com",
  industry: "피트니스",
  isPublished: false,
  sortOrder: 1,
};

describe("portfolio schemas", () => {
  test("accepts and normalizes a complete valid input", () => {
    const result = createPortfolioSchema.safeParse({
      ...validInput,
      title: "  필라테스 스튜디오  ",
      summary: "  예약 전환 중심의 아임웹 사이트  ",
      industry: "  피트니스  ",
    });

    assert.equal(result.success, true);
    if (!result.success) assert.fail("valid input must pass");

    assert.deepEqual(result.data, validInput);
  });

  test("enforces the title length after trimming", () => {
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, title: "   " }).success,
      false,
    );
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, title: "x".repeat(160) })
        .success,
      true,
    );
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, title: "x".repeat(161) })
        .success,
      false,
    );
  });

  test("accepts only lowercase alphanumeric slugs separated by single hyphens", () => {
    for (const slug of ["portfolio", "portfolio-2026", "a"] as const) {
      assert.equal(
        createPortfolioSchema.safeParse({ ...validInput, slug }).success,
        true,
        `${slug} must be accepted`,
      );
    }

    for (const slug of [
      "Portfolio",
      "한글-slug",
      "portfolio slug",
      "-portfolio",
      "portfolio-",
      "portfolio--item",
      "portfolio_item",
      "x".repeat(121),
    ]) {
      assert.equal(
        createPortfolioSchema.safeParse({ ...validInput, slug }).success,
        false,
        `${slug} must be rejected`,
      );
    }
  });

  test("accepts empty or absolute HTTP and HTTPS URLs", () => {
    for (const imageUrl of [
      "",
      "http://example.com/image.jpg",
      "https://example.com/image.jpg",
    ] as const) {
      assert.equal(
        createPortfolioSchema.safeParse({ ...validInput, imageUrl }).success,
        true,
        `${imageUrl || "empty URL"} must be accepted`,
      );
    }
  });

  test("rejects relative and non-HTTP URLs", () => {
    for (const siteUrl of [
      "/portfolio/item",
      "example.com",
      "ftp://example.com/item",
      "javascript:alert(1)",
    ] as const) {
      assert.equal(
        createPortfolioSchema.safeParse({ ...validInput, siteUrl }).success,
        false,
        `${siteUrl} must be rejected`,
      );
    }
  });

  test("accepts a UUID or null project id and rejects malformed ids", () => {
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, projectId: null }).success,
      true,
    );
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, projectId: "project-1" })
        .success,
      false,
    );
  });

  test("accepts only nonnegative integer sort orders", () => {
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, sortOrder: 0 }).success,
      true,
    );
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, sortOrder: -1 }).success,
      false,
    );
    assert.equal(
      createPortfolioSchema.safeParse({ ...validInput, sortOrder: 1.5 }).success,
      false,
    );
    assert.equal(
      createPortfolioSchema.safeParse({
        ...validInput,
        sortOrder: 2_147_483_647,
      }).success,
      true,
    );
    assert.equal(
      createPortfolioSchema.safeParse({
        ...validInput,
        sortOrder: 2_147_483_648,
      }).success,
      false,
    );
  });

  test("requires at least one update field", () => {
    assert.equal(updatePortfolioSchema.safeParse({}).success, false);
    assert.equal(
      updatePortfolioSchema.safeParse({ title: "수정 제목" }).success,
      true,
    );
    assert.equal(updatePortfolioSchema.safeParse({ projectId: null }).success, true);
  });
});

describe("resolvePublishedAt", () => {
  const now = "2026-08-06T10:00:00.000Z";
  const previous = "2026-08-01T00:00:00.000Z";

  test("sets the current time when an item becomes published", () => {
    assert.equal(resolvePublishedAt(false, null, true, now), now);
  });

  test("preserves the original time while an item remains published", () => {
    assert.equal(resolvePublishedAt(true, previous, true, now), previous);
  });

  test("clears the publication time when an item becomes private", () => {
    assert.equal(resolvePublishedAt(true, previous, false, now), null);
  });

  test("keeps the publication time empty while an item remains private", () => {
    assert.equal(resolvePublishedAt(false, null, false, now), null);
  });
});
