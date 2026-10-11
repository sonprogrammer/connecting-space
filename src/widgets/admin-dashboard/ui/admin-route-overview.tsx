"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

import { adminNavigationGroups } from "@/widgets/admin-shell";
import { redirectToAdminLogin } from "@/shared/lib/auth/admin-login-redirect";
import {
  fetchAdminWorkItems,
  formatWorkItemAge,
  getWorkItemActionLabel,
  todayDashboardActions,
  type AdminWorkItem,
  type AdminWorkItemsResponse,
  type WorkItemGroup,
} from "../model/admin-today-dashboard";
import { getLegacyInquiryRedirect } from "../model/admin-route-overview";

export { getLegacyInquiryRedirect } from "../model/admin-route-overview";

type DashboardState =
  | { status: "loading" }
  | { status: "success"; data: AdminWorkItemsResponse; items: AdminWorkItem[]; loadingMore: boolean }
  | { status: "error"; message: string };

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
          <div><dt className="text-xs text-[var(--admin-text-muted)]">상태</dt><dd className="mt-1 font-semibold">{item.status}</dd></div>
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
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [selectedItem, setSelectedItem] = useState<AdminWorkItem | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (selectedGroup: WorkItemGroup, page = 1, asOf?: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (page === 1) setState({ status: "loading" });
    else setState((current) => current.status === "success" ? { ...current, loadingMore: true } : current);
    try {
      const data = await fetchAdminWorkItems({ group: selectedGroup, page, pageSize: 25, asOf }, fetch, controller.signal);
      if (controller.signal.aborted) return;
      setState((current) => page === 1 || current.status !== "success"
        ? { status: "success", data, items: data.items, loadingMore: false }
        : { status: "success", data: current.data, items: [...current.items, ...data.items], loadingMore: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof Error && "status" in error && (error.status === 401 || error.status === 403)) {
        redirectToAdminLogin();
        return;
      }
      setState({ status: "error", message: error instanceof Error ? error.message : "업무 목록을 불러오지 못했습니다." });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(group));
    return () => requestRef.current?.abort();
  }, [group, load]);

  const featureItems = adminNavigationGroups.flatMap((navigationGroup) => navigationGroup.items).filter((item) => item.href !== "/admin");
  const itemCount = state.status === "success" ? state.data.counts.total : null;

  return (
    <section aria-labelledby="admin-overview-title" className="space-y-6">
      <LegacyInquiryHashRedirect />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--admin-brand)]">Admin workspace</p>
          <h1 id="admin-overview-title" className="mt-1 text-2xl font-bold text-[var(--admin-text)] sm:text-3xl">오늘 할 일</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">{itemCount === null ? "업무 우선순위와 대기 현황을 확인합니다." : `전체 미처리 업무 ${itemCount.toLocaleString()}건`}</p>
        </div>
        <button type="button" onClick={() => void load(group)} disabled={state.status === "loading"} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-medium text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:opacity-60 sm:self-auto">
          <RefreshCw aria-hidden="true" className="size-4" /> 새로고침
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" role="group" aria-label="업무 종류별 건수">
        {todayDashboardActions.map((action) => {
          const count = state.status === "success" ? state.data.counts[action.countKey] : null;
          return <button type="button" key={action.group} aria-pressed={group === action.group} onClick={() => setGroup(group === action.group ? "all" : action.group)}
            className={`min-w-0 rounded-xl border bg-[var(--admin-surface)] p-4 text-left text-[var(--admin-text)] outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] sm:p-5 ${group === action.group ? "border-[var(--admin-brand)] ring-1 ring-[var(--admin-brand)]" : "border-[var(--admin-border)]"}`}>
            <span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold">{action.title}</span><ArrowRight aria-hidden="true" className="size-4 shrink-0 text-[var(--admin-text-muted)]" /></span>
            <span className="mt-3 block text-3xl font-bold tabular-nums" aria-live="polite">{count === null ? state.status === "error" ? "—" : <span className="text-base font-medium text-[var(--admin-text-muted)]">불러오는 중</span> : count.toLocaleString()}</span>
            <span className="mt-2 block text-xs leading-5 text-[var(--admin-text-muted)]">{action.description}</span>
          </button>;
        })}
      </div>

      <section aria-labelledby="today-task-list-title" aria-busy={state.status === "loading"} className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <div className="border-b border-[var(--admin-border)] p-4 sm:px-5">
          <h2 id="today-task-list-title" className="text-lg font-bold text-[var(--admin-text)]">{group === "all" ? "우선 확인할 업무" : todayDashboardActions.find((item) => item.group === group)?.title}</h2>
          <p className="mt-1 text-xs text-[var(--admin-text-muted)]">{state.status === "success" ? `전체 ${state.data.pagination.total.toLocaleString()}건 · 서버 우선순위순` : "업무 목록을 확인합니다."}</p>
        </div>
        {state.status === "loading" ? <div role="status" className="space-y-3 p-5 text-sm text-[var(--admin-text-muted)]"><span className="inline-flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 업무를 불러오는 중입니다.</span><div aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" /><div aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" /></div> : null}
        {state.status === "error" ? <div className="p-6 text-center" role="alert"><p className="text-sm text-[var(--admin-text)]">{state.message}</p><button type="button" onClick={() => void load(group)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><RefreshCw aria-hidden="true" className="size-4" /> 다시 시도</button></div> : null}
        {state.status === "success" && state.items.length === 0 ? <div className="p-8 text-center"><Inbox aria-hidden="true" className="mx-auto size-8 text-[var(--admin-text-muted)]" /><p className="mt-3 font-semibold text-[var(--admin-text)]">{state.data.counts.total === 0 ? "오늘 확인할 업무가 없습니다." : "선택한 업무가 없습니다."}</p><p className="mt-1 text-sm text-[var(--admin-text-muted)]">다른 업무 종류를 선택하거나 기존 관리자 메뉴에서 확인할 수 있습니다.</p></div> : null}
        {state.status === "success" && state.items.length > 0 ? <>
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(7rem,0.55fr)_auto] gap-4 bg-[var(--admin-surface-muted)] px-5 py-3 text-xs font-semibold text-[var(--admin-text-muted)] md:grid"><span>고객 / 업무</span><span>분류</span><span>대기 시간</span><span>다음 행동</span></div>
          <ul className="divide-y divide-[var(--admin-border)]">{state.items.map((item) => <li key={item.id}><button type="button" onClick={() => setSelectedItem(item)} className="grid w-full gap-2 px-4 py-4 text-left outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] md:grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(7rem,0.55fr)_auto] md:items-center md:gap-4 md:px-5">
            <span className="min-w-0"><span className="block truncate font-semibold text-[var(--admin-text)]">{item.customerName}</span><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{item.title}</span></span>
            <span className="flex items-center justify-between gap-2 text-sm text-[var(--admin-text)] md:block"><span className="md:hidden text-xs text-[var(--admin-text-muted)]">업무 종류</span>{todayDashboardActions.find((action) => action.group === item.group)?.title}</span>
            <span className="flex items-center justify-between gap-2 text-sm text-[var(--admin-text-muted)] md:block"><span className="md:hidden text-xs">대기</span>{formatWorkItemAge(item.ageSeconds, item.group === "overduePayment")}</span>
            <span className="justify-self-end text-sm font-semibold text-[var(--admin-brand)]">{getWorkItemActionLabel(item.action)} <span aria-hidden="true">→</span></span>
          </button></li>)}</ul>
          {state.data.pagination.hasNextPage ? <div className="border-t border-[var(--admin-border)] p-4 text-center"><button type="button" disabled={state.loadingMore} onClick={() => void load(group, state.data.pagination.page + 1, state.data.asOf)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-4 text-sm font-semibold text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:opacity-60">{state.loadingMore ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}더 불러오기</button></div> : null}
        </> : null}
      </section>

      <nav aria-label="기존 관리자 기능" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{featureItems.map((item) => <Link key={item.id} href={item.href} className="flex min-h-14 items-center justify-between rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 text-sm font-semibold text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">{item.label}<ArrowRight aria-hidden="true" className="size-4 text-[var(--admin-text-muted)]" /></Link>)}</nav>
      <WorkItemDialog item={selectedItem} onClose={() => setSelectedItem(null)} />
    </section>
  );
}
