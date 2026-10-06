import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runInNewContext } from "node:vm";

import {
  ADMIN_THEME_INIT_SCRIPT,
  ADMIN_THEME_STORAGE_KEY,
  getAdminThemeDomState,
  parseAdminThemePreference,
  resolveAdminTheme,
} from "../src/widgets/admin-shell/model/theme";

describe("admin theme model", () => {
  test("accepts the three preferences and falls back safely", () => {
    assert.equal(parseAdminThemePreference("system"), "system");
    assert.equal(parseAdminThemePreference("light"), "light");
    assert.equal(parseAdminThemePreference("dark"), "dark");
    assert.equal(parseAdminThemePreference("sepia"), "system");
    assert.equal(parseAdminThemePreference(null), "system");
    assert.equal(ADMIN_THEME_STORAGE_KEY, "connecting-space-admin-theme");
  });

  test("resolves system preference and describes both DOM changes", () => {
    assert.equal(resolveAdminTheme("system", true), "dark");
    assert.equal(resolveAdminTheme("system", false), "light");
    assert.equal(resolveAdminTheme("light", true), "light");
    assert.deepEqual(getAdminThemeDomState("dark"), {
      dataAdminTheme: "dark",
      hasDarkClass: true,
    });
    assert.deepEqual(getAdminThemeDomState("light"), {
      dataAdminTheme: "light",
      hasDarkClass: false,
    });
  });

  test("initializes saved admin theme before paint and ignores public routes", () => {
    const createContext = (pathname: string) => {
      let storageReads = 0;
      const attributes = new Map<string, string>();
      const classes = new Set<string>();
      return {
        context: {
          window: {
            location: { pathname },
            localStorage: {
              getItem(key: string) {
                storageReads += 1;
                assert.equal(key, "connecting-space-admin-theme");
                return "dark";
              },
            },
            matchMedia(query: string) {
              assert.equal(query, "(prefers-color-scheme: dark)");
              return { matches: false };
            },
          },
          document: {
            documentElement: {
              setAttribute(name: string, value: string) {
                attributes.set(name, value);
              },
              classList: {
                toggle(name: string, force: boolean) {
                  if (force) classes.add(name);
                  else classes.delete(name);
                },
              },
            },
          },
        },
        attributes,
        classes,
        getStorageReads: () => storageReads,
      };
    };

    const admin = createContext("/admin/projects");
    runInNewContext(ADMIN_THEME_INIT_SCRIPT, admin.context);
    assert.equal(admin.attributes.get("data-admin-theme"), "dark");
    assert.equal(admin.classes.has("dark"), true);
    assert.equal(admin.getStorageReads(), 1);

    const publicPage = createContext("/portfolio");
    runInNewContext(ADMIN_THEME_INIT_SCRIPT, publicPage.context);
    assert.equal(publicPage.attributes.size, 0);
    assert.equal(publicPage.classes.size, 0);
    assert.equal(publicPage.getStorageReads(), 0);
  });

  test("protects storage and system preference access failures", () => {
    assert.doesNotThrow(() =>
      runInNewContext(ADMIN_THEME_INIT_SCRIPT, {
        window: {
          location: { pathname: "/admin" },
          localStorage: {
            getItem() {
              throw new Error("storage unavailable");
            },
          },
          matchMedia() { throw new Error("media unavailable"); },
        },
        document: {
          documentElement: {
            attributes: new Map<string, string>(),
            setAttribute(name: string, value: string) {
              this.attributes.set(name, value);
            },
            classList: { toggle() {} },
          },
        },
      }),
    );
  });

  test("applies a light fallback when storage and system media are unavailable", () => {
    const attributes = new Map<string, string>();
    runInNewContext(ADMIN_THEME_INIT_SCRIPT, {
      window: {
        location: { pathname: "/admin/projects" },
        localStorage: { getItem() { throw new Error("blocked"); } },
        matchMedia() { throw new Error("unsupported"); },
      },
      document: {
        documentElement: {
          setAttribute(name: string, value: string) { attributes.set(name, value); },
          classList: { toggle() {} },
        },
      },
    });
    assert.equal(attributes.get("data-admin-theme"), "light");
  });
});
