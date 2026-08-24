import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildFaqPayload,
  buildServicePayload,
  getContentSaveFailure,
  serviceToFormValues,
} from "../src/features/manage-automation-content/model/content-form";

describe("automation content forms", () => {
  test("maps nullable prices and one-item-per-line lists to the API contract", () => {
    assert.deepEqual(
      buildServicePayload({
        slug: "business-site",
        name: "Business",
        description: "표준 제작",
        priceLabel: "180만원~",
        priceMin: "1800000",
        priceMax: "",
        durationLabel: "2~3주",
        includedItems: "메인 페이지\n\n FAQ 구성 ",
        excludedItems: "촬영",
        aiGuidance: "  예산 확인 ",
        isPublished: true,
        sortOrder: "2",
      }),
      {
        slug: "business-site",
        name: "Business",
        description: "표준 제작",
        priceLabel: "180만원~",
        priceMin: 1800000,
        priceMax: null,
        durationLabel: "2~3주",
        includedItems: ["메인 페이지", "FAQ 구성"],
        excludedItems: ["촬영"],
        aiGuidance: "예산 확인",
        isPublished: true,
        sortOrder: 2,
      },
    );
  });

  test("round-trips API content into editable values", () => {
    const values = serviceToFormValues({
      id: "service-1", slug: "starter", name: "Starter", description: "설명",
      priceLabel: "90만원~", priceMin: null, priceMax: 1200000,
      durationLabel: "1주", includedItems: ["메인", "문의"], excludedItems: [],
      aiGuidance: null, isPublished: false, sortOrder: 0,
      createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z",
    });
    assert.equal(values.priceMin, "");
    assert.equal(values.priceMax, "1200000");
    assert.equal(values.includedItems, "메인\n문의");
  });

  test("builds the FAQ payload without leaking whitespace", () => {
    assert.deepEqual(buildFaqPayload({
      question: " 제작 기간은? ", answer: " 2~3주입니다. ", aiGuidance: " ",
      isPublished: true, sortOrder: "1",
    }), {
      question: "제작 기간은?", answer: "2~3주입니다.", aiGuidance: null,
      isPublished: true, sortOrder: 1,
    });
  });

  test("maps validation, conflict, and auth errors", () => {
    assert.deepEqual(getContentSaveFailure(400, {
      error: { code: "VALIDATION_ERROR", message: "invalid", details: {
        fieldErrors: { priceMin: ["0 이상이어야 합니다."] }, formErrors: [],
      } },
    }).fieldErrors, { priceMin: ["0 이상이어야 합니다."] });
    assert.deepEqual(getContentSaveFailure(409, {
      error: { code: "SERVICE_OFFERING_SLUG_CONFLICT", message: "conflict" },
    }).fieldErrors, { slug: ["이미 사용 중인 slug입니다."] });
    assert.equal(getContentSaveFailure(401, {
      error: { code: "ADMIN_AUTH_REQUIRED", message: "unauthorized" },
    }).message, "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.");
  });
});
