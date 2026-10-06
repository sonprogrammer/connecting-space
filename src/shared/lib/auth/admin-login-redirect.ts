export function getAdminLoginDestination(search: string) {
  const candidate = new URLSearchParams(search).get("next");
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/admin";
  }

  try {
    const destination = new URL(candidate, "http://admin.local");
    if (
      destination.origin !== "http://admin.local" ||
      (destination.pathname !== "/admin" && !destination.pathname.startsWith("/admin/"))
    ) {
      return "/admin";
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/admin";
  }
}

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
