/**
 * useWindowTheme / 窗口主题钩子.
 *
 * - Loads the persisted choice on mount.
 * - Reflects the choice via `data-window-theme` on <html> so CSS can react
 *   without a re-render (index.html sets the same attribute pre-paint to
 *   avoid an opaque → transparent flash).
 * - Invokes the Rust `set_window_theme` command so the native effect (or
 *   its removal) is applied to the actual window.
 * - Watches `resolvedTheme` from next-themes; when it changes the native
 *   effect is re-applied with the new light/dark hint so the material
 *   tracks the user's color mode.
 *
 * The hook is intentionally singleton-ish: the App shell mounts it once.
 * Inner components that need to read/write the current theme call this
 * hook too — React's state stays in sync via the shared localStorage write.
 */
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { setWindowTheme } from "@/lib/tauri/commands/window-theme";
import {
  DEFAULT_WINDOW_THEME,
  WINDOW_THEME_STORAGE_KEY,
  detectRendererPlatform,
  getWindowThemeDescriptor,
  isValidWindowThemeId,
  isWindowThemeSupportedOn,
  type WindowThemeId,
} from "@/lib/windowTheme";
import { readStorageItem, writeStorageItem } from "@/platform/storage";

const WINDOW_THEME_CHANGE_EVENT = "window-theme-change";

function readPersistedTheme(platform: string): WindowThemeId {
  const raw = readStorageItem(WINDOW_THEME_STORAGE_KEY);
  if (!isValidWindowThemeId(raw)) return DEFAULT_WINDOW_THEME;
  // Defensive: if someone copied a profile from macOS to Windows, fall
  // back to default rather than asking Rust to do something it can't.
  if (!isWindowThemeSupportedOn(raw, platform)) return DEFAULT_WINDOW_THEME;
  return raw;
}

function syncRootAttribute(id: WindowThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-window-theme", id);
}

function notifyWindowThemeChange(id: WindowThemeId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WindowThemeId>(WINDOW_THEME_CHANGE_EVENT, {
      detail: id,
    }),
  );
}

export function useWindowTheme() {
  const platform = detectRendererPlatform();
  const [themeId, setThemeIdState] = useState<WindowThemeId>(() =>
    readPersistedTheme(platform),
  );
  const { resolvedTheme } = useTheme();

  // Push the current theme + appearance to the OS whenever either changes.
  // Wait until next-themes has resolved the actual color scheme — applying
  // before that defaults to "light", which flickers if the user is in dark
  // mode (material would briefly switch Sidebar → HudWindow).
  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    syncRootAttribute(themeId);
    void setWindowTheme(themeId, resolvedTheme).catch(() => {});
  }, [themeId, resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleThemeChange = (event: Event) => {
      const next = (event as CustomEvent<WindowThemeId>).detail;
      if (!isWindowThemeSupportedOn(next, platform)) return;
      setThemeIdState(next);
    };

    window.addEventListener(WINDOW_THEME_CHANGE_EVENT, handleThemeChange as EventListener);

    return () => {
      window.removeEventListener(WINDOW_THEME_CHANGE_EVENT, handleThemeChange as EventListener);
    };
  }, [platform]);

  const setThemeId = useCallback(
    (next: WindowThemeId) => {
      if (!isWindowThemeSupportedOn(next, platform)) return;
      writeStorageItem(WINDOW_THEME_STORAGE_KEY, next);
      notifyWindowThemeChange(next);
      setThemeIdState(next);
    },
    [platform],
  );

  return {
    themeId,
    setThemeId,
    platform,
    descriptor: getWindowThemeDescriptor(themeId),
    /** Whether the given theme can be picked on this OS. */
    isSupported: (id: WindowThemeId) => isWindowThemeSupportedOn(id, platform),
  };
}
