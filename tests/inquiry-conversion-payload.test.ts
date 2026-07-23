import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AdminInquiryDetail } from "../src/entities/inquiry";
import {
  buildConversionCustomerPayload,
  buildConversionProjectPayload,
  isInquiryConverted,
} from "../src/features/convert-inquiry-to-project/model/conversion-payload";

const baseInquiry: AdminInquiryDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_name: "손영진",
  email: "youngjin@example.com",
  phone: "010-1234-5678",
  company_name: "커넥팅 스페이스",
  website_url: "https://example.com",
  service_type: "아임웹 제작",
  budget_min: 2000000,
  budget_max: 5000000,
  desired_launch_date: "2026-08-15",
  message: "랜딩 페이지 제작이 필요합니다.",
  source: "homepage",
  status: "qualified",
  admin_notes: null,
  converted_customer_id: null,
  converted_project_id: null,
  created_at: "2026-07-23T01:23:00.000Z",
  updated_at: "2026-07-23T01:23:00.000Z",
};

describe("inquiry conversion payloads", () => {
  test("detects converted inquiries from status or conversion ids", () => {
    assert.equal(isInquiryConverted(baseInquiry), false);
    assert.equal(isInquiryConverted({ ...baseInquiry, status: "converted" }), true);
    assert.equal(
      isInquiryConverted({
        ...baseInquiry,
        converted_customer_id: "22222222-2222-4222-8222-222222222222",
      }),
      true,
    );
    assert.equal(
      isInquiryConverted({
        ...baseInquiry,
        converted_project_id: "33333333-3333-4333-8333-333333333333",
      }),
      true,
    );
  });

  test("builds customer payload from inquiry detail and form values", () => {
    assert.deepEqual(
      buildConversionCustomerPayload(baseInquiry, {
        customerName: "  손 대표님  ",
        customerMemo: "  첫 상담 후 전환  ",
      }),
      {
        inquiryId: baseInquiry.id,
        name: "손 대표님",
        email: "youngjin@example.com",
        phone: "010-1234-5678",
        companyName: "커넥팅 스페이스",
        websiteUrl: "https://example.com",
        memo: "첫 상담 후 전환",
      },
    );
  });

  test("builds project payload from created customer and form values", () => {
    assert.deepEqual(
      buildConversionProjectPayload(baseInquiry, {
        customerId: "22222222-2222-4222-8222-222222222222",
        projectName: "  커넥팅 스페이스 홈페이지  ",
        contractAmount: "5000000",
        expectedLaunchDate: "2026-09-01",
        projectMemo: "  1차 범위 확정  ",
      }),
      {
        customerId: "22222222-2222-4222-8222-222222222222",
        inquiryId: baseInquiry.id,
        name: "커넥팅 스페이스 홈페이지",
        description: "랜딩 페이지 제작이 필요합니다.",
        contractAmount: 5000000,
        expectedLaunchDate: "2026-09-01",
        memo: "1차 범위 확정",
      },
    );
  });
});
