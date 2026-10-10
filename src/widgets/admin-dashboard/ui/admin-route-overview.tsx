"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

import type { AdminInquiryListItem } from "@/entities/inquiry";
import { formatAdminInquiryCreatedAt, getInquiryStatusLabel } from "@/entities/inquiry";
import { adminNavigationGroups } from "@/widgets/admin-shell";
import type { ApiResponse } from "@/shared/types/api";
import { redirectToAdminLogin } from "@/shared/lib/auth/admin-login-redirect";
import { getTodayInquiryTasks, todayDashboardActions, type TodayInquirySort } from "../model/admin-today-dashboard";
import { getLegacyInquiryRedirect } from "../model/admin-route-overview";

export { getLegacyInquiryRedirect } from "../model/admin-route-overview";

type InquiryState =
  | { status: "loading" }
  | { status: "success"; inquiries: AdminInquiryListItem[] }
  | { status: "error"; message: string };

function LegacyInquiryHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const destination = getLegacyInquiryRedirect(window.location.hash);
    if (destination) router.replace(destination);
  }, [router]);

  return null;
}

export function AdminRouteOverview() {
  const [state, setState] = useState<InquiryState>({ status: "loading" });
  const [sort, setSort] = useState<TodayInquirySort>("oldest");
  const [selectedInquiry, setSelectedInquiry] = useState<AdminInquiryListItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadInquiries = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/inquiries", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        redirectToAdminLogin();
        return;
      }

      const result = (await response.json()) as ApiResponse<AdminInquiryListItem[]>;
      if (!response.ok || "error" in result) {
        setState({
          status: "error",
          message: "error" in result ? result.error.message : "문의 목록을 불러오지 못했습니다.",
        });
        return;
      }

      setState({ status: "success", inquiries: result.data });
    } catch {
      setState({ status: "error", message: "네트워크 문제로 문의 목록을 불러오지 못했습니다." });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadInquiries());
  }, [loadInquiries]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !selectedInquiry || dialog.open) return;
    dialog.showModal();
  }, [selectedInquiry]);

  const tasks = useMemo(
    () => state.status === "success" ? getTodayInquiryTasks(state.inquiries, sort) : [],
    [state, sort],
  );

  function closeDialog() {
    dialogRef.current?.close();
    setSelectedInquiry(null);
  }

  const featureItems = adminNavigationGroups
    .flatMap((group) => group.items)
    .filter((item) => item.href !== "/admin");

  return (
    <section aria-labelledby="admin-overview-title" className="space-y-6">
      <LegacyInquiryHashRedirect />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--admin-brand)]">Admin workspace</p>
          <h1 id="admin-overview-title" className="mt-1 text-2xl font-bold text-[var(--admin-text)] sm:text-3xl">
            오늘 할 일
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">
            업무별 전체 건수 집계 API가 없어 전체 미처리 건수는 표시하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setState({ status: "loading" }); void loadInquiries(); }}
          disabled={state.status === "loading"}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-medium text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw aria-hidden="true" className="size-4" /> 새로고침
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4" role="group" aria-label="업무 종류별 건수">
        {todayDashboardActions.map((action) => {
          const cardClassName = "group block min-w-0 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text)] sm:p-5";
          const cardContent = (
            <>
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold">{action.title}</span>
                {action.href ? <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-[var(--admin-text-muted)] transition-transform group-hover:translate-x-1" /> : null}
              </span>
              <span className="mt-3 block text-3xl font-bold tabular-nums" aria-live={action.available ? "polite" : undefined}>
                {action.available
                  ? state.status === "loading" ? <span className="text-base font-medium text-[var(--admin-text-muted)]">불러오는 중</span>
                    : state.status === "error" ? "—" : tasks.length
                  : <span className="text-base font-semibold text-[var(--admin-text-muted)]">API 미제공</span>}
              </span>
              {!action.available ? <span className="mt-2 block text-xs leading-5 text-[var(--admin-text-muted)]">{action.description}</span> : null}
              {action.available && state.status === "success" ? <span className="mt-2 block text-xs text-[var(--admin-text-muted)]">최근 문의 최대 100건 조회 결과</span> : null}
              {action.available && state.status === "error" ? <span className="mt-2 block text-xs text-[var(--admin-text-muted)]">건수를 확인할 수 없습니다.</span> : null}
            </>
          );

          if (!action.href) {
            return <article key={action.id} className={cardClassName}>{cardContent}</article>;
          }

          return (
            <Link
              key={action.id}
              href={action.href}
              aria-label={`${action.title}, ${state.status === "success" ? `${tasks.length}건` : state.status === "error" ? "건수 확인 불가" : "불러오는 중"}. ${action.description} 기존 기능으로 이동`}
              className={`${cardClassName} outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]`}
            >
              {cardContent}
            </Link>
          );
        })}
      </div>

      <section aria-labelledby="today-task-list-title" aria-busy={state.status === "loading"} className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--admin-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 id="today-task-list-title" className="text-lg font-bold text-[var(--admin-text)]">확인 가능한 업무</h2>
            <p className="mt-1 text-xs text-[var(--admin-text-muted)]">신규 문의 목록 API가 제공하는 최근 최대 100건만 포함합니다.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--admin-text)]">
            <Clock3 aria-hidden="true" className="size-4 text-[var(--admin-text-muted)]" />
            정렬
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as TodayInquirySort)}
              className="min-h-10 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
            >
              <option value="oldest">오래 기다린순</option>
              <option value="newest">최신순</option>
            </select>
          </label>
        </div>

        {state.status === "loading" ? (
          <div role="status" className="space-y-3 p-5 text-sm text-[var(--admin-text-muted)]">
            <span className="inline-flex items-center gap-2"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 업무를 불러오는 중입니다.</span>
            <div aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" />
            <div aria-hidden="true" className="h-16 animate-pulse rounded-lg bg-[var(--admin-surface-muted)]" />
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="p-6 text-center" role="alert">
            <p className="text-sm text-[var(--admin-text)]">{state.message}</p>
            <button type="button" onClick={() => { setState({ status: "loading" }); void loadInquiries(); }} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
              <RefreshCw aria-hidden="true" className="size-4" /> 다시 시도
            </button>
          </div>
        ) : null}

        {state.status === "success" && tasks.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox aria-hidden="true" className="mx-auto size-8 text-[var(--admin-text-muted)]" />
            <p className="mt-3 font-semibold text-[var(--admin-text)]">조회된 신규 문의가 없습니다.</p>
            <p className="mt-1 text-sm text-[var(--admin-text-muted)]">최근 문의 최대 100건 안에서 확인한 결과입니다.</p>
            <Link href="/admin/inquiries" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-4 text-sm font-semibold text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
              문의 목록 열기 <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        ) : null}

        {state.status === "success" && tasks.length > 0 ? (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_auto] gap-4 bg-[var(--admin-surface-muted)] px-5 py-3 text-xs font-semibold text-[var(--admin-text-muted)] md:grid">
              <span>고객</span><span>업무</span><span>접수일</span><span>다음 행동</span>
            </div>
            <ul className="divide-y divide-[var(--admin-border)]">
              {tasks.map((inquiry) => (
                <li key={inquiry.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedInquiry(inquiry)}
                    className="grid w-full gap-2 px-4 py-4 text-left outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] md:grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_auto] md:items-center md:gap-4 md:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[var(--admin-text)]">{inquiry.customer_name}</span>
                      {inquiry.company_name ? <span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{inquiry.company_name}</span> : null}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-sm text-[var(--admin-text)] md:block">
                      <span className="md:hidden text-xs text-[var(--admin-text-muted)]">업무</span>
                      신규 문의 · {getInquiryStatusLabel(inquiry.status)}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-sm text-[var(--admin-text-muted)] md:block">
                      <span className="md:hidden text-xs">접수일</span>{formatAdminInquiryCreatedAt(inquiry.created_at)}
                    </span>
                    <span className="justify-self-end text-sm font-semibold text-[var(--admin-brand)]">문의 확인 <span aria-hidden="true">→</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <nav aria-label="기존 관리자 기능" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {featureItems.map((item) => (
          <Link key={item.id} href={item.href} className="flex min-h-14 items-center justify-between rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 text-sm font-semibold text-[var(--admin-text)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
            {item.label}<ArrowRight aria-hidden="true" className="size-4 text-[var(--admin-text-muted)]" />
          </Link>
        ))}
      </nav>

      <dialog
        ref={dialogRef}
        aria-labelledby="today-task-dialog-title"
        onClose={() => setSelectedInquiry(null)}
        onClick={(event) => { if (event.target === dialogRef.current) closeDialog(); }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-[var(--admin-surface)] p-5 text-[var(--admin-text)] backdrop:bg-black/45 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-[var(--admin-border)] sm:p-6"
      >
        {selectedInquiry ? (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--admin-brand)]">신규 문의</p>
                <h2 id="today-task-dialog-title" className="mt-1 text-xl font-bold">{selectedInquiry.customer_name}</h2>
              </div>
              <button type="button" onClick={closeDialog} className="min-h-10 rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">닫기</button>
            </div>
            <dl className="mt-6 grid gap-4 rounded-xl bg-[var(--admin-surface-muted)] p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[var(--admin-text-muted)]">상태</dt><dd className="mt-1 font-semibold">{getInquiryStatusLabel(selectedInquiry.status)}</dd></div>
              <div><dt className="text-xs text-[var(--admin-text-muted)]">접수일</dt><dd className="mt-1 font-semibold">{formatAdminInquiryCreatedAt(selectedInquiry.created_at)}</dd></div>
              {selectedInquiry.company_name ? <div><dt className="text-xs text-[var(--admin-text-muted)]">회사</dt><dd className="mt-1 font-semibold">{selectedInquiry.company_name}</dd></div> : null}
              <div><dt className="text-xs text-[var(--admin-text-muted)]">서비스 종류</dt><dd className="mt-1 font-semibold">{selectedInquiry.service_type}</dd></div>
            </dl>
            <p className="mt-4 text-sm leading-6 text-[var(--admin-text-muted)]">문의 내용 확인과 답변은 기존 문의 상세 화면에서 계속할 수 있습니다.</p>
            <Link href={`/admin/inquiries#inquiry-${encodeURIComponent(selectedInquiry.id)}`} onClick={() => setSelectedInquiry(null)} className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
              상세 페이지에서 계속 <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
