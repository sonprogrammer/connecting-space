"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

import { adminNavigationGroups } from "@/widgets/admin-shell";
import { redirectToAdminLogin } from "@/shared/lib/auth/admin-login-redirect";
import {
  adminWorkItemsInfiniteQueryOptions,
  ADMIN_WORK_ITEMS_PAGE_SIZE,
  formatWorkItemAge,
  getDefaultWorkItemsSort,
  getAdminWorkItemsLoadedCount,
  getAdminWorkItemsTotal,
  getWorkItemActionLabel,
  getWorkItemStatusLabel,
  todayDashboardActions,
  type AdminWorkItem,
  type WorkItemGroup,
  type WorkItemSort,
} from "../model/admin-today-dashboard";
import { getLegacyInquiryRedirect } from "../model/admin-route-overview";
import { AdminDashboardPreviewPanels } from "./admin-dashboard-preview-panels";
import { AdminFinancialSummaryPanel } from "./admin-financial-summary-panel";

export { getLegacyInquiryRedirect } from "../model/admin-route-overview";

function LegacyInquiryHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const destination = getLegacyInquiryRedirect(window.location.hash);
    if (destination) router.replace(destination);
  }, [router]);
  return null;
}

function WorkItemDialog({ item, onClose }: { item: AdminWorkItem | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (item && !dialogRef.current?.open) dialogRef.current?.showModal();
    else if (!item && dialogRef.current?.open) dialogRef.current.close();
  }, [item]);
  return (
    <dialog ref={dialogRef} aria-labelledby="today-task-dialog-title" onClose={onClose}
      onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-[var(--admin-surface)] p-5 text-[var(--admin-text)] backdrop:bg-black/45 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-[var(--admin-border)] sm:p-6">
      {item ? <div>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-[var(--admin-brand)]">{getWorkItemActionLabel(item.action)}</p><h2 id="today-task-dialog-title" className="mt-1 text-xl font-bold">{item.customerName}</h2></div>
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">닫기</button>
        </div>
        <dl className="mt-6 grid gap-4 rounded-xl bg-[var(--admin-surface-muted)] p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[var(--admin-text-muted)]">업무</dt><dd className="mt-1 font-semibold">{item.title}</dd></div>
          <div><dt className="text-xs text-[var(--admin-text-muted)]">상태</dt><dd className="mt-1 font-semibold">{getWorkItemStatusLabel(item)}</dd></div>
          <div><dt className="text-xs text-[var(--admin-text-muted)]">대기 시간</dt><dd className="mt-1 font-semibold">{formatWorkItemAge(item.ageSeconds, item.group === "overduePayment")}</dd></div>
          {item.dueDate ? <div><dt className="text-xs text-[var(--admin-text-muted)]">기한</dt><dd className="mt-1 font-semibold">{item.dueDate}</dd></div> : null}
          {item.deliveryStatus ? <div><dt className="text-xs text-[var(--admin-text-muted)]">발송 상태</dt><dd className="mt-1 font-semibold">{item.deliveryStatus}</dd></div> : null}
        </dl>
        <p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">기존 관리자 상세 화면에서 업무를 계속할 수 있습니다.</p>
        <Link href={item.deepLink} onClick={onClose} className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
          상세 페이지에서 계속 <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div> : null}
    </dialog>
  );
}

export function AdminRouteOverview() {
  const [group, setGroup] = useState<WorkItemGroup>("all");
  const [sort, setSort] = useState<WorkItemSort>("waiting");
  const [selectedItem, setSelectedItem] = useState<AdminWorkItem | null>(null);
  const query = useInfiniteQuery(adminWorkItemsInfiniteQueryOptions({ group, sort, pageSize: ADMIN_WORK_ITEMS_PAGE_SIZE }));
  const pages = query.data?.pages ?? [];
  const latestPage = pages.at(-1);
  const items = pages.flatMap((page) => page.items);
  const loadedCount = getAdminWorkItemsLoadedCount(pages);
  const totalCount = getAdminWorkItemsTotal(latestPage);
  const initialLoading = query.isPending && !query.data;
  const initialError = query.isError && !query.data;

  useEffect(() => {
    if (query.error instanceof Error && "status" in query.error && (query.error.status === 401 || query.error.status === 403)) {
      redirectToAdminLogin();
    }
  }, [query.error]);

  function changeSort(nextSort: WorkItemSort) {
    setSort(nextSort);
  }

  function changeGroup(nextGroup: WorkItemGroup) {
    setGroup(nextGroup);
    setSort(getDefaultWorkItemsSort(nextGroup));
  }

  const featureItems = adminNavigationGroups.flatMap((navigationGroup) => navigationGroup.items).filter((item) => item.href !== "/admin");
  const itemCount = latestPage?.counts.total ?? null;

  return (
    <section aria-labelledby="admin-overview-title" className="space-y-6">
      <LegacyInquiryHashRedirect />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--admin-brand)]">Admin workspace</p>
          <h1 id="admin-overview-title" className="mt-1 text-2xl font-bold text-[var(--admin-text)] sm:text-3xl">오늘 할 일</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">{itemCount === null ? "업무 우선순위와 대기 현황을 확인합니다." : `전체 미처리 업무 ${itemCount.toLocaleString()}건`}</p>
        </div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-medium text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:opacity-60 sm:self-auto">
          <RefreshCw aria-hidden="true" className="size-4" /> 새로고침
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" role="group" aria-label="업무 종류별 건수">
        {todayDashboardActions.map((action) => {
          const count = latestPage ? latestPage.counts[action.countKey] : null;
          return <button type="button" key={action.group} aria-pressed={group === action.group} onClick={() => changeGroup(group === action.group ? "all" : action.group)}
            className={`min-w-0 rounded-xl border bg-[var(--admin-surface)] p-4 text-left text-[var(--admin-text)] outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] sm:p-5 ${group === action.group ? "border-[var(--admin-brand)] ring-1 ring-[var(--admin-brand)]" : "border-[var(--admin-border)]"}`}>
            <span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold">{action.title}</span><ArrowRight aria-hidden="true" className="size-4 shrink-0 text-[var(--admin-text-muted)]" /></span>
            <span className="mt-3 block text-3xl font-bold tabular-nums" aria-live="polite">{count === null ? initialError ? "—" : <span className="text-base font-medium text-[var(--admin-text-muted)]">불러오는 중</span> : count.toLocaleString()}</span>
            <span className="mt-2 block text-xs leading-5 text-[var(--admin-text-muted)]">{action.description}</span>
          </button>;
        })}
      </div>

      <AdminFinancialSummaryPanel />

      <section aria-labelledby="today-task-list-title" aria-busy={initialLoading || query.isFetchingNextPage} className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <div className="border-b border-[var(--admin-border)] p-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="today-task-list-title" className="text-lg font-bold text-[var(--admin-text)]">{group === "all" ? "우선 확인할 업무" : todayDashboardActions.find((item) => item.group === group)?.title}</h2>
              <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{latestPage ? `전체 ${totalCount.toLocaleString()}건 · 불러온 ${loadedCount.toLocaleString()}건 · 우선순위는 항상 먼저 적용` : "업무 목록을 확인합니다."}</p>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--admin-text)]">
              정렬
              <select value={latestPage?.group === group ? latestPage.sort : sort}
                onChange={(event) => changeSort(event.target.value as WorkItemSort)}
                className="min-h-10 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
                <option value="waiting">오래 기다린순</option>
                <option value="latest">최신순</option>
              </select>
            </label>
          </div>
        </div>
        {initialLoading ? <div role="status" className="space-y-3 p-5 text-sm text-[var(--admin-text-muted)]"><span className="inline-flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 업무를 불러오는 중입니다.</span><div aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" /><div aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" /></div> : null}
        {initialError ? <div className="p-6 text-center" role="alert"><p className="text-sm text-[var(--admin-text)]">{query.error instanceof Error ? query.error.message : "업무 목록을 불러오지 못했습니다."}</p><button type="button" onClick={() => void query.refetch()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><RefreshCw aria-hidden="true" className="size-4" /> 다시 시도</button></div> : null}
        {query.isError && query.data ? <p role="alert" className="border-b border-[var(--admin-border)] px-4 py-2 text-sm text-[var(--admin-text-muted)]">최신 업무를 불러오지 못했습니다. 현재 저장된 결과를 표시합니다. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>다시 시도</button></p> : null}
        {latestPage && items.length === 0 ? <div className="p-8 text-center"><Inbox aria-hidden="true" className="mx-auto size-8 text-[var(--admin-text-muted)]" /><p className="mt-3 font-semibold text-[var(--admin-text)]">{totalCount === 0 ? "오늘 확인할 업무가 없습니다." : "선택한 업무가 없습니다."}</p><p className="mt-1 text-sm text-[var(--admin-text-muted)]">다른 업무 종류를 선택하거나 기존 관리자 메뉴에서 확인할 수 있습니다.</p></div> : null}
        {latestPage && items.length > 0 ? <>
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(7rem,0.55fr)_minmax(7rem,0.55fr)_auto] gap-4 bg-[var(--admin-surface-muted)] px-5 py-3 text-xs font-semibold text-[var(--admin-text-muted)] lg:grid"><span>고객 / 업무</span><span>분류</span><span>현재 상태</span><span>대기 시간</span><span>다음 행동</span></div>
          <ul className="divide-y divide-[var(--admin-border)]">{items.map((item) => <li key={item.id}><button type="button" onClick={() => setSelectedItem(item)} className="grid w-full gap-2 px-4 py-4 text-left outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] lg:grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(7rem,0.55fr)_minmax(7rem,0.55fr)_auto] lg:items-center lg:gap-4 lg:px-5">
            <span className="min-w-0"><span className="block truncate font-semibold text-[var(--admin-text)]">{item.customerName}</span><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{item.title}</span></span>
            <span className="flex items-center justify-between gap-2 text-sm text-[var(--admin-text)] lg:block"><span className="text-xs text-[var(--admin-text-muted)] lg:hidden">업무 종류</span>{todayDashboardActions.find((action) => action.group === item.group)?.title}</span>
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--admin-text)] lg:block"><span className="text-xs text-[var(--admin-text-muted)] lg:hidden">현재 상태</span>{getWorkItemStatusLabel(item)}</span>
            <span className="flex items-center justify-between gap-2 text-sm text-[var(--admin-text-muted)] lg:block"><span className="text-xs lg:hidden">대기</span>{formatWorkItemAge(item.ageSeconds, item.group === "overduePayment")}</span>
            <span className="justify-self-end text-sm font-semibold text-[var(--admin-brand)]">{getWorkItemActionLabel(item.action)} <span aria-hidden="true">→</span></span>
          </button></li>)}</ul>
          {query.hasNextPage ? <div className="border-t border-[var(--admin-border)] p-4 text-center"><button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-4 text-sm font-semibold text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:opacity-60">{query.isFetchingNextPage ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}더 불러오기</button></div> : null}
        </> : null}
      </section>

      <AdminDashboardPreviewPanels />

      <nav aria-label="기존 관리자 기능" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{featureItems.map((item) => <Link key={item.id} href={item.href} className="flex min-h-14 items-center justify-between rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 text-sm font-semibold text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">{item.label}<ArrowRight aria-hidden="true" className="size-4 text-[var(--admin-text-muted)]" /></Link>)}</nav>
      <WorkItemDialog item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>
  );
}
