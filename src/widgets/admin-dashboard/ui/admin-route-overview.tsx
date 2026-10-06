"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { adminNavigationGroups } from "@/widgets/admin-shell";
import { getLegacyInquiryRedirect } from "../model/admin-route-overview";

export { getLegacyInquiryRedirect } from "../model/admin-route-overview";

function LegacyInquiryHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const destination = getLegacyInquiryRedirect(window.location.hash);
    if (destination) router.replace(destination);
  }, [router]);

  return null;
}

export function AdminRouteOverview() {
  const featureItems = adminNavigationGroups
    .flatMap((group) => group.items)
    .filter((item) => item.href !== "/admin");

  return (
    <section aria-labelledby="admin-overview-title">
      <LegacyInquiryHashRedirect />
      <div className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-6 text-[var(--admin-text)] sm:p-8">
        <p className="text-sm font-semibold text-[var(--admin-brand)]">Admin console</p>
        <h1 id="admin-overview-title" className="mt-2 text-2xl font-bold sm:text-3xl">
          관리자 대시보드
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--admin-text-muted)] sm:text-base">
          운영 요약은 준비 중입니다. 아래 관리 화면에서 기존 기능을 계속 사용할 수 있습니다.
        </p>
      </div>

      <nav aria-label="관리 기능 바로가기" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {featureItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex min-h-32 items-end justify-between rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-5 outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
          >
            <span>
              <strong className="block text-lg">{item.label}</strong>
              <span className="mt-1 block text-sm text-[var(--admin-text-muted)]">기존 관리 기능 열기</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </section>
  );
}
