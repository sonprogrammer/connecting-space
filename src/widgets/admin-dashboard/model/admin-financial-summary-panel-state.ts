import type { AdminFinancialSummaryResponse } from "@/entities/payment";
import type { AdminFinancialSummaryStatus } from "@/entities/payment/model/admin-financial-summary-queries";
import type { ProjectStatus } from "@/entities/project";
import { projectStatusLabels } from "@/widgets/admin-customer-projects/model/admin-customer-project-state";

export const financialSummaryProjectStatuses: readonly ProjectStatus[] = [
  "planning", "in_progress", "review", "completed", "paused", "cancelled",
];

export function getDefaultFinancialSummaryScope(): AdminFinancialSummaryStatus {
  return "active";
}

export function getFinancialSummaryScopeLabel(status: AdminFinancialSummaryStatus) {
  if (status === "active") return "진행 범위";
  if (status === "all") return "전체 프로젝트";
  return projectStatusLabels[status];
}

export function getFinancialSummaryValues(summary: AdminFinancialSummaryResponse) {
  return [summary.expectedRevenue, summary.confirmedRevenue, summary.receivedTotal, summary.outstanding] as const;
}

export function getFinancialSummaryEmptyMessage(summary: AdminFinancialSummaryResponse) {
  return summary.projectCount === 0 ? "선택한 범위에 해당하는 프로젝트가 없습니다." : undefined;
}

export function getFinancialSummaryRefetchWarning(summary: AdminFinancialSummaryResponse | undefined, error: unknown) {
  return summary && error && !isFinancialSummaryAuthError(error)
    ? "최신 재무 요약을 불러오지 못했습니다. 저장된 결과를 표시합니다."
    : undefined;
}

export function isFinancialSummaryAuthError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403));
}
