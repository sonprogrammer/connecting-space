"use client";

import { usePathname } from "next/navigation";

import { getAdminRouteTitle } from "../model/navigation";
import { AdminMobileDrawer } from "./admin-mobile-drawer";
import { AdminMobileHeader } from "./admin-mobile-header";
import { AdminSidebar } from "./admin-sidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return children;
  }

  const title = getAdminRouteTitle(pathname);

  return (
    <div className="min-h-screen bg-[var(--admin-canvas)] text-[var(--admin-text)]">
      <a
        href="#admin-main"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-lg bg-[var(--admin-surface)] px-4 py-2 font-semibold text-[var(--admin-text)] shadow-lg outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-[var(--admin-focus)]"
      >
        본문으로 건너뛰기
      </a>
      <AdminSidebar pathname={pathname} />
      <div className="min-w-0 md:pl-20 xl:pl-72">
        <AdminMobileHeader title={title} menu={<AdminMobileDrawer pathname={pathname} />} />
        <main id="admin-main" tabIndex={-1} className="min-w-0 px-4 py-5 sm:px-6 md:px-8 md:py-8 xl:px-10">
          <div className="mx-auto w-full max-w-[96rem] text-[#17201a]">{children}</div>
        </main>
      </div>
    </div>
  );
}
