"use client";

import { createContext, useContext, useEffect, useState } from "react";

import {
  ADMIN_THEME_STORAGE_KEY,
  getAdminThemeDomState,
  parseAdminThemePreference,
  resolveAdminTheme,
  type AdminThemePreference,
} from "../model/theme";

type AdminThemeContextValue = {
  preference: AdminThemePreference;
  setPreference: (preference: AdminThemePreference) => void;
};

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

function applyAdminTheme(preference: AdminThemePreference) {
  let systemPrefersDark = false;
  try {
    systemPrefersDark = window.matchMedia(SYSTEM_THEME_QUERY).matches;
  } catch {
    // Older or privacy-restricted browsers fall back to light mode.
  }
  const domState = getAdminThemeDomState(resolveAdminTheme(preference, systemPrefersDark));
  const root = document.documentElement;
  root.setAttribute("data-admin-theme", domState.dataAdminTheme);
  root.classList.toggle("dark", domState.hasDarkClass);
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<AdminThemePreference>("system");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    let isActive = true;
    queueMicrotask(() => {
      if (!isActive) return;
      let storedValue: string | null = null;
      try {
        storedValue = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
      } catch {
        // Theme preferences are optional; keep the system default if storage is blocked.
      }
      const storedPreference = parseAdminThemePreference(storedValue);
      setPreferenceState(storedPreference);
      setIsMounted(true);
    });

    return () => {
      isActive = false;
      const root = document.documentElement;
      root.removeAttribute("data-admin-theme");
      root.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    applyAdminTheme(preference);
    if (preference !== "system") return;

    const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
    const handleSystemThemeChange = () => applyAdminTheme("system");
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [isMounted, preference]);

  const setPreference = (nextPreference: AdminThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextPreference);
    } catch {
      // The current session still uses the selected theme when persistence is unavailable.
    }
  };

  return (
    <AdminThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return context;
}
