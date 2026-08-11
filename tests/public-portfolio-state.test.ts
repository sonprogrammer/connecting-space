import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { PublicPortfolioListItem } from "../src/entities/portfolio";
import { toPublicPortfolioState } from "../src/widgets/public-portfolio/model/portfolio-state";

const item: PublicPortfolioListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "필라테스 스튜디오",
  slug: "pilates-studio",
  summary: "예약 전환 중심 홈페이지",
  image_url: null,
  site_url: "https://example.com",
  industry: "피트니스",
  published_at: "2026-08-11T00:00:00.000Z",
};

describe("public portfolio state", () => {
  test("keeps published portfolio items in a success state", () => {
    assert.deepEqual(toPublicPortfolioState({ data: [item] }), {
      status: "success",
      items: [item],
    });
  });

  test("keeps an empty API result as an explicit success state", () => {
    assert.deepEqual(toPublicPortfolioState({ data: [] }), {
      status: "success",
      items: [],
    });
  });

  test("uses a safe Korean message for a retryable section error", () => {
    assert.deepEqual(
      toPublicPortfolioState({
        error: {
          code: "PORTFOLIO_FETCH_FAILED",
          message: "Failed to read portfolio items",
        },
      }),
      {
        status: "error",
        message: "포트폴리오를 불러오지 못했습니다.",
      },
    );
  });
});
