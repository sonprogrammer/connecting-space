"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";

import { adminFinancialSummaryQueryOptions, type AdminFinancialSummaryStatus } from "@/entities/payment/model/admin-financial-summary-queries";
import { projectStatusLabels } from "@/widgets/admin-customer-projects/model/admin-customer-project-state";
import { formatPaymentAmount } from "@/widgets/admin-customer-projects/model/admin-project-payment-state";
import { redirectToAdminLogin } from "@/shared/lib/auth/admin-login-redirect";
import {
  financialSummaryProjectStatuses,
  getDefaultFinancialSummaryScope,
  getFinancialSummaryEmptyMessage,
  getFinancialSummaryRefetchWarning,
  isFinancialSummaryAuthError,
} from "../model/admin-financial-summary-panel-state";

const amountCards = [
  { key: "expectedRevenue", label: "예정 매출" },
  { key: "confirmedRevenue", label: "확정 매출" },
  { key: "receivedTotal", label: "입금 완료" },
  { key: "outstanding", label: "미수금" },
] as const;

const seoulDateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

export function AdminFinancialSummaryPanel() {
  const [status, setStatus] = useState<AdminFinancialSummaryStatus>(getDefaultFinancialSummaryScope);
  const query = useQuery(adminFinancialSummaryQueryOptions(status));

  useEffect(() => {
    if (isFinancialSummaryAuthError(query.error)) redirectToAdminLogin();
  }, [query.error]);

  const summary = query.data;
  const warning = getFinancialSummaryRefetchWarning(summary, query.error);

  return <section aria-labelledby="financial-summary-title" aria-busy={query.isPending} className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text)]">
    <header className="flex flex-col gap-3 border-b border-[var(--admin-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div><h2 id="financial-summary-title" className="text-lg font-bold">프로젝트 재무 현황</h2><p className="mt-1 text-xs text-[var(--admin-text-muted)]">서버 집계 기준 · 금액은 원 단위입니다.</p></div>
      <label className="flex min-h-10 items-center gap-2 text-sm font-medium">조회 범위<select aria-label="프로젝트 재무 조회 범위" value={status} onChange={(event) => setStatus(event.target.value as AdminFinancialSummaryStatus)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] sm:flex-none">
        <option value="active">진행 범위 (기획·제작 중·검수·보류)</option>
        {financialSummaryProjectStatuses.map((projectStatus) => <option key={projectStatus} value={projectStatus}>{projectStatusLabels[projectStatus]}</option>)}
        <option value="all">전체 프로젝트</option>
      </select></label>
    </header>
    {query.isPending && !summary ? <div role="status" className="grid grid-cols-2 gap-3 p-4 xl:grid-cols-4 sm:p-5"><span className="col-span-full inline-flex items-center gap-2 text-sm text-[var(--admin-text-muted)]"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 재무 현황을 불러오는 중입니다.</span>{amountCards.map((card) => <div key={card.key} aria-hidden="true" className="h-24 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" />)}</div> : null}
    {query.isError && !summary ? <div role="alert" className="p-6 text-center"><p className="text-sm">{query.error instanceof Error ? query.error.message : "재무 요약을 불러오지 못했습니다."}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><RefreshCw aria-hidden="true" className="size-4" /> 다시 시도</button></div> : null}
    {warning ? <p role="alert" className="border-b border-[var(--admin-border)] px-4 py-2 text-sm text-[var(--admin-text-muted)] sm:px-5">{warning} <button type="button" onClick={() => void query.refetch()} className="font-semibold underline">다시 시도</button></p> : null}
    {summary ? <>
      {summary.projectCount === 0 ? <p className="px-4 pt-4 text-sm text-[var(--admin-text-muted)] sm:px-5">{getFinancialSummaryEmptyMessage(summary)}</p> : null}
      <dl className="grid grid-cols-2 gap-3 p-4 xl:grid-cols-4 sm:p-5">{amountCards.map((card) => <div key={card.key} className="min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 sm:p-4"><dt className="text-xs font-medium text-[var(--admin-text-muted)] sm:text-sm">{card.label}</dt><dd className="mt-2 break-words text-lg font-bold tabular-nums sm:text-xl">{formatPaymentAmount(summary[card.key])}</dd></div>)}</dl>
      <div className="flex flex-col gap-2 border-t border-[var(--admin-border)] px-4 py-3 text-xs text-[var(--admin-text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-5"><p>{summary.projectCount.toLocaleString()}개 프로젝트 · 포함 상태: {summary.includedStatuses.map((value) => projectStatusLabels[value]).join(", ") || "없음"}</p><p>기준 {seoulDateTime.format(new Date(summary.asOf))} (한국 시간)</p></div>
    </> : null}
    <div className="border-t border-[var(--admin-border)] px-4 py-3 sm:px-5"><Link href="/admin/projects" className="inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-semibold text-[var(--admin-brand)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">프로젝트 관리 <ArrowRight aria-hidden="true" className="size-4" /></Link></div>
  </section>;
}
