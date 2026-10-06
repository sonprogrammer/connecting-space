export type AdminNavigationIconKey =
  | "dashboard"
  | "inquiries"
  | "customers"
  | "projects"
  | "portfolio"
  | "content";

export type AdminNavigationItem = {
  id: AdminNavigationIconKey;
  label: string;
  href: string;
  icon: AdminNavigationIconKey;
};

export type AdminNavigationGroup = {
  id: "dashboard" | "sales" | "operations" | "site";
  label: string;
  items: readonly AdminNavigationItem[];
};

export const adminNavigationGroups: readonly AdminNavigationGroup[] = [
  {
    id: "dashboard",
    label: "대시보드",
    items: [{ id: "dashboard", label: "대시보드", href: "/admin", icon: "dashboard" }],
  },
  {
    id: "sales",
    label: "영업",
    items: [{ id: "inquiries", label: "문의·견적", href: "/admin/inquiries", icon: "inquiries" }],
  },
  {
    id: "operations",
    label: "운영",
    items: [
      { id: "customers", label: "고객", href: "/admin/customers", icon: "customers" },
      { id: "projects", label: "프로젝트·입금", href: "/admin/projects", icon: "projects" },
    ],
  },
  {
    id: "site",
    label: "사이트 관리",
    items: [
      { id: "portfolio", label: "포트폴리오", href: "/admin/portfolio", icon: "portfolio" },
      { id: "content", label: "콘텐츠", href: "/admin/content", icon: "content" },
    ],
  },
];

export function isAdminRouteActive(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getAdminRouteTitle(pathname: string) {
  const item = adminNavigationGroups
    .flatMap((group) => group.items)
    .find((candidate) => isAdminRouteActive(pathname, candidate.href));

  return item?.label ?? "관리자";
}
