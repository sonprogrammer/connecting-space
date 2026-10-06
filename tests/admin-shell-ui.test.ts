import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminThemeProvider } from "../src/widgets/admin-shell/ui/admin-theme-provider";
import { AdminSidebar } from "../src/widgets/admin-shell/ui/admin-sidebar";

describe("admin shell UI", () => {
  test("renders grouped accessible navigation with the current page", () => {
    const html = renderToStaticMarkup(
      createElement(
        AdminThemeProvider,
        null,
        createElement(AdminSidebar, { pathname: "/admin/projects" }),
      ),
    );

    assert.match(html, /<nav[^>]*aria-label="관리자 메뉴"/);
    for (const group of ["대시보드", "영업", "운영", "사이트 관리"]) {
      assert.match(html, new RegExp(`>${group}<`));
    }
    for (const label of ["대시보드", "문의·견적", "고객", "프로젝트·입금", "포트폴리오", "콘텐츠"]) {
      assert.match(html, new RegExp(`aria-label="${label}"`));
    }
    const activeProjectLink = html.match(/<a[^>]*href="\/admin\/projects"[^>]*>/)?.[0];
    assert.ok(activeProjectLink);
    assert.match(activeProjectLink, /aria-current="page"/);
    assert.match(html, /관리자 화면 테마/);
  });

  test("uses the modal primitive for focus containment and restoration", () => {
    const drawerSource = readFileSync(
      "src/widgets/admin-shell/ui/admin-mobile-drawer.tsx",
      "utf8",
    );
    const shellSource = readFileSync("src/widgets/admin-shell/ui/admin-shell.tsx", "utf8");

    assert.match(drawerSource, /Dialog\.Root[^>]*modal/);
    assert.match(drawerSource, /Dialog\.Trigger/);
    assert.match(drawerSource, /aria-label="관리자 메뉴 열기"/);
    assert.match(drawerSource, /initialFocus=\{firstLinkRef\}/);
    assert.match(drawerSource, /finalFocus=\{triggerRef\}/);
    assert.match(drawerSource, /Dialog\.Backdrop/);
    assert.match(drawerSource, /Dialog\.Close/);
    assert.match(shellSource, /href="#admin-main"/);
    assert.match(shellSource, /<main[^>]*id="admin-main"/);
  });

  test("keeps the theme and mobile navigation entry point reachable on tablet", () => {
    const sidebarSource = readFileSync(
      "src/widgets/admin-shell/ui/admin-sidebar.tsx",
      "utf8",
    );
    const headerSource = readFileSync(
      "src/widgets/admin-shell/ui/admin-mobile-header.tsx",
      "utf8",
    );
    assert.match(sidebarSource, /overflow-y-auto/);
    assert.match(sidebarSource, /createPortal/);
    assert.match(headerSource, /xl:hidden/);
  });

  test("keeps the dashboard overview foreground bound to its theme tokens", () => {
    const overviewSource = readFileSync(
      "src/widgets/admin-dashboard/ui/admin-route-overview.tsx",
      "utf8",
    );
    assert.match(overviewSource, /text-\[var\(--admin-text\)\]/);
  });
});
