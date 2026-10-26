"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

import type { AdminInquiryListItem } from "@/entities/inquiry";
import type { AdminProjectListItem, ProjectStatus } from "@/entities/project";
import { getInquiryStatusLabel } from "@/entities/inquiry/model/admin-inquiry";
import { redirectToAdminLogin } from "@/shared/lib/auth/admin-login-redirect";
import { projectStatusLabels } from "@/widgets/admin-customer-projects/model/admin-customer-project-state";
import {
  adminDashboardInquiryQueryOptions,
  adminUpcomingProjectQueryOptions,
  getProjectLaunchDateLabel,
  getProjectPreviewHref,
  getRecentInquiryPreview,
  getUpcomingProjectPreview,
} from "../model/admin-dashboard-preview-queries";

function useAdminAuthRedirect(error: unknown) {
  useEffect(() => {
    if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) {
      redirectToAdminLogin();
    }
  }, [error]);
}

function PreviewState({
  loading,
  error,
  hasData,
  empty,
  onRetry,
}: Readonly<{ loading: boolean; error: unknown; hasData: boolean; empty: boolean; onRetry: () => void }>) {
  if (loading) return <p role="status" className="flex min-h-24 items-center justify-center gap-2 p-5 text-sm text-[var(--admin-text-muted)]"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 불러오는 중입니다.</p>;
  if (error && !hasData) return <div role="alert" className="p-5 text-center"><p className="text-sm text-[var(--admin-text-muted)]">{error instanceof Error ? error.message : "목록을 불러오지 못했습니다."}</p><button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--admin-brand)] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"><RefreshCw aria-hidden="true" className="size-4" /> 다시 시도</button></div>;
  if (error && hasData) return <p role="alert" className="border-b border-[var(--admin-border)] px-4 py-2 text-sm text-[var(--admin-text-muted)]">최신 목록을 불러오지 못했습니다. 저장된 결과를 표시합니다. <button type="button" onClick={onRetry} className="font-semibold underline">다시 시도</button></p>;
  if (empty) return <div className="p-6 text-center"><Inbox aria-hidden="true" className="mx-auto size-7 text-[var(--admin-text-muted)]" /><p className="mt-2 text-sm text-[var(--admin-text-muted)]">표시할 항목이 없습니다.</p></div>;
  return null;
}

function InquiryPreview() {
  const query = useQuery(adminDashboardInquiryQueryOptions);
  useAdminAuthRedirect(query.error);
  const items = query.data ? getRecentInquiryPreview(query.data) : [];

  return <section aria-labelledby="recent-inquiries-title" aria-busy={query.isPending} className="min-w-0 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] p-4 sm:px-5"><div><h2 id="recent-inquiries-title" className="font-bold text-[var(--admin-text)]">최근 문의</h2><p className="mt-1 text-xs text-[var(--admin-text-muted)]">최신 문의 {query.data ? `${query.data.length.toLocaleString()}건 중 ${items.length}건` : "확인 중"}</p></div><Link href="/admin/inquiries" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--admin-brand)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">전체 보기 <ArrowRight aria-hidden="true" className="size-4" /></Link></header>
    <PreviewState loading={query.isPending && !query.data} error={query.error} hasData={Boolean(query.data)} empty={Boolean(query.data && items.length === 0)} onRetry={() => { void query.refetch(); }} />
    {items.length > 0 ? <ul className="divide-y divide-[var(--admin-border)]">{items.map((item) => <InquiryRow key={item.id} item={item} />)}</ul> : null}
  </section>;
}

function InquiryRow({ item }: Readonly<{ item: AdminInquiryListItem }>) {
  return <li><Link href={`/admin/inquiries#inquiry-${item.id}`} className="block min-h-16 px-4 py-3 outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] sm:px-5"><span className="flex items-start justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold text-[var(--admin-text)]">{item.company_name || item.customer_name}</span><span className="shrink-0 rounded-full bg-[var(--admin-surface-muted)] px-2 py-1 text-xs text-[var(--admin-text-muted)]">{getInquiryStatusLabel(item.status)}</span></span><span className="mt-1 block truncate text-xs text-[var(--admin-text-muted)]">{item.service_type} · {item.customer_name}</span></Link></li>;
}

function ProjectPreview() {
  const query = useQuery(adminUpcomingProjectQueryOptions);
  useAdminAuthRedirect(query.error);
  const items = query.data ? getUpcomingProjectPreview(query.data.items) : [];

  return <section aria-labelledby="upcoming-projects-title" aria-busy={query.isPending} className="min-w-0 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
    <header className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] p-4 sm:px-5"><div><h2 id="upcoming-projects-title" className="font-bold text-[var(--admin-text)]">예정 출시 프로젝트</h2><p className="mt-1 text-xs text-[var(--admin-text-muted)]">진행 중 · 출시 예정일순{query.data ? ` · 전체 ${query.data.total.toLocaleString()}건 중 ${items.length}건` : ""}</p></div><Link href="/admin/projects" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--admin-brand)] outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">전체 보기 <ArrowRight aria-hidden="true" className="size-4" /></Link></header>
    <PreviewState loading={query.isPending && !query.data} error={query.error} hasData={Boolean(query.data)} empty={Boolean(query.data && items.length === 0)} onRetry={() => { void query.refetch(); }} />
    {items.length > 0 ? <ul className="divide-y divide-[var(--admin-border)]">{items.map((item) => <ProjectRow key={item.id} item={item} />)}</ul> : null}
  </section>;
}

function ProjectRow({ item }: Readonly<{ item: AdminProjectListItem }>) {
  return <li><Link href={getProjectPreviewHref(item.id)} className="block min-h-16 px-4 py-3 outline-none hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"><span className="flex items-start justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold text-[var(--admin-text)]">{item.name}</span><span className="shrink-0 text-xs text-[var(--admin-text-muted)]">{projectStatusLabels[item.status as ProjectStatus]}</span></span><span className="mt-1 block text-xs text-[var(--admin-text-muted)]">예정 출시일: {getProjectLaunchDateLabel(item.expected_launch_date)}</span></Link></li>;
}

export function AdminDashboardPreviewPanels() {
  return <div className="grid min-w-0 gap-4 xl:grid-cols-2"><InquiryPreview /><ProjectPreview /></div>;
}
