"use client";

import { useAdminTheme } from "./admin-theme-provider";
import type { AdminThemePreference } from "../model/theme";

const themeOptions: readonly { value: AdminThemePreference; label: string }[] = [
  { value: "system", label: "시스템" },
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
];

export function AdminThemeControl() {
  const { preference, setPreference } = useAdminTheme();

  return (
    <fieldset className="admin-theme-transition rounded-xl border border-[var(--admin-border)] p-1">
      <legend className="sr-only">관리자 화면 테마</legend>
      <div className="grid grid-cols-3 gap-1" aria-label="관리자 화면 테마">
        {themeOptions.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-lg px-2 py-1.5 text-center text-xs font-semibold text-[var(--admin-text-muted)] has-checked:bg-[var(--admin-surface)] has-checked:text-[var(--admin-text)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--admin-focus)]"
          >
            <input
              className="sr-only"
              type="radio"
              name="admin-theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => setPreference(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
