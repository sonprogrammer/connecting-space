import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AdminFinancialSummaryResponse } from "../src/entities/payment/api/financial-summary";
import { registerPathAlias } from "./helpers/register-path-alias";

registerPathAlias();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const panelState = require("../src/widgets/admin-dashboard/model/admin-financial-summary-panel-state") as typeof import("../src/widgets/admin-dashboard/model/admin-financial-summary-panel-state");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const queryModel = require("../src/entities/payment/model/admin-financial-summary-queries") as typeof import("../src/entities/payment/model/admin-financial-summary-queries");

const summary: AdminFinancialSummaryResponse = {
  asOf: "2026-10-25T00:00:00.000Z", status: "active" as const,
  includedStatuses: ["planning", "in_progress", "review", "paused"],
  projectCount: 0, expectedRevenue: 0, confirmedRevenue: 0, receivedTotal: 0, outstanding: 0,
};

describe("admin financial summary panel", () => {
  test("summary scope defaults to active and maps selected status to its query", () => {
    assert.equal(panelState.getDefaultFinancialSummaryScope(), "active");
    assert.deepEqual(queryModel.adminFinancialSummaryQueryOptions("planning").queryKey, queryModel.adminFinancialSummaryQueryKeys.byStatus("planning"));
    assert.equal(panelState.getFinancialSummaryScopeLabel("active"), "진행 범위");
  });

  test("empty summary displays server zeros with an explicit no-project message", () => {
    assert.deepEqual(panelState.getFinancialSummaryValues(summary), [0, 0, 0, 0]);
    assert.equal(panelState.getFinancialSummaryEmptyMessage(summary), "선택한 범위에 해당하는 프로젝트가 없습니다.");
  });

  test("cached summary remains visible with a retry warning after refetch error", () => {
    assert.equal(panelState.getFinancialSummaryRefetchWarning(summary, new Error("network down")), "최신 재무 요약을 불러오지 못했습니다. 저장된 결과를 표시합니다.");
    assert.equal(panelState.getFinancialSummaryRefetchWarning(undefined, new Error("network down")), undefined);
  });

  test("401 and 403 summary errors request the existing login redirect", () => {
    assert.equal(panelState.isFinancialSummaryAuthError({ status: 401 }), true);
    assert.equal(panelState.isFinancialSummaryAuthError({ status: 403 }), true);
    assert.equal(panelState.isFinancialSummaryAuthError({ status: 500 }), false);
  });
});
