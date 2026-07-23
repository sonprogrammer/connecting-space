import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createInquiryInputFromFormData } from "../src/features/submit-inquiry/model/form-data";

describe("createInquiryInputFromFormData", () => {
  test("converts public inquiry form values to the API contract", () => {
    const formData = new FormData();
    formData.set("customerName", "  손영진  ");
    formData.set("email", " son@example.com ");
    formData.set("phone", "010-1234-5678");
    formData.set("companyName", "");
    formData.set("websiteUrl", "https://example.com");
    formData.set("serviceType", "business");
    formData.set("budgetMin", "900000");
    formData.set("budgetMax", "");
    formData.set("desiredLaunchDate", "2026-08-31");
    formData.set("message", "아임웹 홈페이지 제작 문의를 남깁니다.");

    assert.deepEqual(createInquiryInputFromFormData(formData), {
      customerName: "손영진",
      email: "son@example.com",
      phone: "010-1234-5678",
      companyName: "",
      websiteUrl: "https://example.com",
      serviceType: "business",
      budgetMin: 900000,
      desiredLaunchDate: "2026-08-31",
      message: "아임웹 홈페이지 제작 문의를 남깁니다.",
      source: "public-home",
    });
  });
});
