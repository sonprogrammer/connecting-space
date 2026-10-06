export const ADMIN_THEME_STORAGE_KEY = "connecting-space-admin-theme";

export type AdminThemePreference = "system" | "light" | "dark";
export type ResolvedAdminTheme = Exclude<AdminThemePreference, "system">;

export function parseAdminThemePreference(value: string | null): AdminThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveAdminTheme(
  preference: AdminThemePreference,
  systemPrefersDark: boolean,
): ResolvedAdminTheme {
  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return preference;
}

export function getAdminThemeDomState(theme: ResolvedAdminTheme) {
  return {
    dataAdminTheme: theme,
    hasDarkClass: theme === "dark",
  };
}

export const ADMIN_THEME_INIT_SCRIPT = `(() => {
  const pathname = window.location.pathname;
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return;
  let preference = "system";
  try {
    const stored = window.localStorage.getItem("${ADMIN_THEME_STORAGE_KEY}");
    if (stored === "light" || stored === "dark" || stored === "system") preference = stored;
  } catch (_) {}
  let systemPrefersDark = false;
  try {
    systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (_) {}
  const resolved = preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
  const root = document.documentElement;
  root.setAttribute("data-admin-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
})();`;
