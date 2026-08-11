import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AdminPortfolioListItem } from "../src/entities/portfolio";
import {
  getPortfolioSaveFailure,
  toAdminPortfolioListState,
} from "../src/widgets/admin-portfolio/model/admin-portfolio-state";

const item: AdminPortfolioListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  project_id: null,
  title: "필라테스 스튜디오",
  slug: "pilates-studio",
  summary: null,
  image_url: null,
  site_url: null,
  industry: "피트니스",
  is_published: false,
  published_at: null,
  sort_order: 0,
  created_at: "2026-08-11T00:00:00.000Z",
  updated_at: "2026-08-11T00:00:00.000Z",
};

describe("admin portfolio state", () => {
  test("maps an API list to the success state", () => {
    assert.deepEqual(toAdminPortfolioListState({ data: [item] }), {
      status: "success",
      items: [item],
    });
  });

  test("maps list failures to an error state", () => {
    assert.deepEqual(
      toAdminPortfolioListState({
        error: { code: "READ_FAILED", message: "Failed to read portfolio items" },
      }),
      { status: "error", message: "포트폴리오 목록을 불러오지 못했습니다." },
    );
  });

  test("maps unauthorized list failures to a login expiry message", () => {
    assert.deepEqual(
      toAdminPortfolioListState(
        { error: { code: "ADMIN_AUTH_REQUIRED", message: "unauthorized" } },
        401,
      ),
      {
        status: "error",
        message: "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.",
      },
    );
  });
});

describe("portfolio save failures", () => {
  test("preserves Zod field errors beside their inputs", () => {
    assert.deepEqual(
      getPortfolioSaveFailure(400, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid portfolio payload",
          details: {
            formErrors: [],
            fieldErrors: { title: ["제목을 입력해 주세요."] },
          },
        },
      }),
      {
        fieldErrors: { title: ["제목을 입력해 주세요."] },
        message: "입력값을 다시 확인해 주세요.",
      },
    );
  });

  test("maps slug conflicts and invalid projects to the matching fields", () => {
    assert.deepEqual(
      getPortfolioSaveFailure(409, {
        error: { code: "PORTFOLIO_SLUG_CONFLICT", message: "conflict" },
      }).fieldErrors,
      { slug: ["이미 사용 중인 slug입니다."] },
    );
    assert.deepEqual(
      getPortfolioSaveFailure(400, {
        error: { code: "INVALID_PORTFOLIO_PROJECT", message: "missing" },
      }).fieldErrors,
      { projectId: ["존재하는 프로젝트 ID를 입력해 주세요."] },
    );
  });

  test("shows a login expiry message for unauthorized saves", () => {
    assert.equal(
      getPortfolioSaveFailure(401, {
        error: { code: "ADMIN_AUTH_REQUIRED", message: "unauthorized" },
      }).message,
      "관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.",
    );
  });
});
