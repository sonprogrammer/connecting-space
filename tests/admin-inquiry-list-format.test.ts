import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  formatAdminInquiryCreatedAt,
  formatInquiryBudget,
  formatInquiryDesiredLaunchDate,
  getInquiryPrimaryContact,
  getInquiryStatusLabel,
} from "../src/entities/inquiry/model/admin-inquiry";

describe("admin inquiry list formatting", () => {
  test("uses phone before email for the primary contact", () => {
    assert.equal(
      getInquiryPrimaryContact({
        phone: "010-1234-5678",
        email: "hello@example.com",
      }),
      "010-1234-5678",
    );
  });

  test("falls back to email or an empty-state label for contact", () => {
    assert.equal(
      getInquiryPrimaryContact({ phone: null, email: "hello@example.com" }),
      "hello@example.com",
    );
    assert.equal(
      getInquiryPrimaryContact({ phone: null, email: null }),
      "연락처 없음",
    );
  });

  test("maps inquiry status to Korean admin labels", () => {
    assert.equal(getInquiryStatusLabel("new"), "신규");
    assert.equal(getInquiryStatusLabel("contacted"), "상담 중");
    assert.equal(getInquiryStatusLabel("qualified"), "검토 완료");
    assert.equal(getInquiryStatusLabel("converted"), "전환 완료");
    assert.equal(getInquiryStatusLabel("closed"), "종료");
  });

  test("formats created date in Korean admin list style", () => {
    assert.equal(
      formatAdminInquiryCreatedAt("2026-07-23T01:23:00.000Z"),
      "2026. 07. 23.",
    );
  });

  test("formats inquiry budget ranges for admin detail", () => {
    assert.equal(formatInquiryBudget(2000000, 5000000), "200만원 ~ 500만원");
    assert.equal(formatInquiryBudget(2000000, null), "200만원 이상");
    assert.equal(formatInquiryBudget(null, 5000000), "500만원 이하");
    assert.equal(formatInquiryBudget(null, null), "예산 미정");
  });

  test("formats desired launch dates for admin detail", () => {
    assert.equal(formatInquiryDesiredLaunchDate("2026-08-15"), "2026. 08. 15.");
    assert.equal(formatInquiryDesiredLaunchDate(null), "희망일 미정");
  });
});
