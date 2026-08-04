import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createInquirySchema } from "../src/features/submit-inquiry/schemas/inquiry.schema";

const validInquiry = {
  customerName: "손영진",
  email: "son@example.com",
  phone: "010-1234-5678",
  companyName: "커넥팅 스페이스",
  websiteUrl: "https://example.com",
  serviceType: "business",
  budgetMin: 900_000,
  budgetMax: 1_500_000,
  desiredLaunchDate: "2026-08-31",
  message: "아임웹 홈페이지 제작 문의를 남깁니다.",
  source: "public-home",
};

describe("createInquirySchema", () => {
  test("accepts and normalizes a valid public inquiry payload", () => {
    const result = createInquirySchema.safeParse({
      ...validInquiry,
      customerName: "  손영진  ",
      companyName: "  커넥팅 스페이스  ",
      serviceType: "  business  ",
      message: "  아임웹 홈페이지 제작 문의를 남깁니다.  ",
      source: "  public-home  ",
    });

    assert.equal(result.success, true);

    if (!result.success) {
      assert.fail("A valid public inquiry payload must be accepted");
    }

    assert.deepEqual(result.data, validInquiry);
  });

  test("rejects payloads missing each required field", () => {
    for (const field of ["customerName", "serviceType", "message"] as const) {
      const payload: Record<string, unknown> = { ...validInquiry };
      delete payload[field];

      assert.equal(
        createInquirySchema.safeParse(payload).success,
        false,
        `${field} must be required`,
      );
    }
  });

  test("rejects a malformed website URL", () => {
    const result = createInquirySchema.safeParse({
      ...validInquiry,
      websiteUrl: "not-a-url",
    });

    assert.equal(result.success, false);
  });

  test("rejects a malformed desired launch date", () => {
    const result = createInquirySchema.safeParse({
      ...validInquiry,
      desiredLaunchDate: "2026-02-30",
    });

    assert.equal(result.success, false);
  });

  test("accepts messages from 10 through 4000 characters only", () => {
    assert.equal(
      createInquirySchema.safeParse({ ...validInquiry, message: "x".repeat(9) })
        .success,
      false,
    );
    assert.equal(
      createInquirySchema.safeParse({ ...validInquiry, message: "x".repeat(10) })
        .success,
      true,
    );
    assert.equal(
      createInquirySchema.safeParse({ ...validInquiry, message: "x".repeat(4000) })
        .success,
      true,
    );
    assert.equal(
      createInquirySchema.safeParse({ ...validInquiry, message: "x".repeat(4001) })
        .success,
      false,
    );
  });
});
