"use client";

import { useEffect, useState, type Ref } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  FileText,
  FolderKanban,
  Images,
  LayoutDashboard,
  MessageSquareText,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  adminNavigationGroups,
  isAdminRouteActive,
  type AdminNavigationIconKey,
} from "../model/navigation";
import { AdminThemeControl } from "./admin-theme-control";

const icons: Record<AdminNavigationIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  inquiries: MessageSquareText,
  customers: UsersRound,
  projects: FolderKanban,
  portfolio: Images,
  content: FileText,
};

type AdminNavigationMenuProps = {
  pathname: string;
  compact?: boolean;
  firstLinkRef?: Ref<HTMLAnchorElement>;
  onNavigate?: () => void;
};

function AdminNavigationItem({
  item,
  active,
  compact,
  firstLinkRef,
  onNavigate,
}: {
  item: (typeof adminNavigationGroups)[number]["items"][number];
  active: boolean;
  compact: boolean;
  firstLinkRef?: Ref<HTMLAnchorElement>;
  onNavigate?: () => void;
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const Icon = icons[item.icon];

  useEffect(() => {
    if (!tooltipPosition) return;
    const dismissTooltip = () => setTooltipPosition(null);
    window.addEventListener("scroll", dismissTooltip, true);
    window.addEventListener("resize", dismissTooltip);
    return () => {
      window.removeEventListener("scroll", dismissTooltip, true);
      window.removeEventListener("resize", dismissTooltip);
    };
  }, [tooltipPosition]);

  function showTooltip(element: HTMLAnchorElement) {
    if (compact) return;
    const bounds = element.getBoundingClientRect();
    setTooltipPosition({ left: bounds.right + 12, top: bounds.top + bounds.height / 2 });
  }

  return (
    <>
      <Link
        ref={firstLinkRef}
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        title={!compact ? item.label : undefined}
        onClick={onNavigate}
        onMouseEnter={(event) => showTooltip(event.currentTarget)}
        onMouseLeave={() => setTooltipPosition(null)}
        onFocus={(event) => showTooltip(event.currentTarget)}
        onBlur={() => setTooltipPosition(null)}
        className={compact
          ? "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--admin-text)] outline-none transition-colors hover:bg-[var(--admin-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] aria-[current=page]:bg-[var(--admin-brand)] aria-[current=page]:text-[var(--admin-brand-contrast)]"
          : "group relative flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--admin-brand-contrast)]/80 outline-none transition-colors hover:bg-white/10 hover:text-[var(--admin-brand-contrast)] focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] aria-[current=page]:bg-white/15 aria-[current=page]:text-[var(--admin-brand-contrast)] xl:justify-start"}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className={compact ? undefined : "md:hidden xl:inline"}>{item.label}</span>
      </Link>
      {!compact && tooltipPosition && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--admin-text)] px-2.5 py-1.5 text-xs text-[var(--admin-surface)] shadow-lg xl:hidden"
              style={tooltipPosition}
            >
              {item.label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

export function AdminNavigationMenu({
  pathname,
  compact = false,
  firstLinkRef,
  onNavigate,
}: AdminNavigationMenuProps) {
  let linkIndex = 0;

  return (
    <nav aria-label="관리자 메뉴" className="space-y-5">
      {adminNavigationGroups.map((group) => (
        <section key={group.id} aria-labelledby={`admin-nav-${group.id}`}>
          <h2
            id={`admin-nav-${group.id}`}
            className={compact ? "mb-2 text-xs font-semibold text-[var(--admin-text-muted)]" : "mb-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-brand-contrast)]/65 xl:block md:sr-only xl:not-sr-only"}
          >
            {group.label}
          </h2>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isAdminRouteActive(pathname, item.href);
              const currentIndex = linkIndex++;
              return (
                <li key={item.id}>
                  <AdminNavigationItem
                    item={item}
                    active={active}
                    compact={compact}
                    firstLinkRef={currentIndex === 0 ? firstLinkRef : undefined}
                    onNavigate={onNavigate}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col overflow-y-auto bg-[var(--admin-brand)] px-3 py-6 text-[var(--admin-brand-contrast)] md:flex xl:w-72 xl:px-5">
      <Link
        href="/admin"
        aria-label="Connecting Space 관리자 대시보드"
        className="mb-8 flex items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] xl:justify-start xl:px-3"
      >
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-white/15 text-lg font-black">C</span>
        <span className="ml-3 hidden text-base font-bold xl:inline">Connecting Space</span>
      </Link>

      <AdminNavigationMenu pathname={pathname} />

      <div className="mt-auto hidden pt-8 xl:block">
        <AdminThemeControl />
      </div>
    </aside>
  );
}
