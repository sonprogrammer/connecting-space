export function getAdminLoginHref(pathname = "/admin", search = "") {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) {
    return "/admin/login?next=%2Fadmin";
  }

  const normalizedSearch = search
    ? search.startsWith("?") ? search : `?${search}`
    : "";
  return `/admin/login?next=${encodeURIComponent(`${pathname}${normalizedSearch}`)}`;
}

export function redirectToAdminLogin() {
  window.location.assign(
    getAdminLoginHref(window.location.pathname, window.location.search),
  );
}
