/**
 * Window theme registry / 窗口主题注册表.
 *
 * Adding a new theme later is a four-step change:
 *   1. Add a `WindowThemeId` literal here and a `WINDOW_THEMES` entry.
 *   2. Extend the Rust `WindowTheme` enum + `apply_theme` match arm.
 *   3. Create `src/styles/theme/window-<id>.css` (copy window-glass.css as
 *      a template, find/replace the selector prefix) and add one
 *      `@import` line for it in `src/styles/index.css`. Set
 *      `needsTransparency: true` below if the theme needs the webview
 *      root to be see-through.
 *   4. Add i18n labels (`windowTheme.<id>`).
 *
 * The Settings UI and the boot script both render from this registry, so the
 * three call sites stay in sync automatically.
 */
import { Sparkles, Square, type LucideIcon } from "lucide-react";

import type { WindowThemeId } from "@/lib/tauri/commands/window-theme";

export type { WindowThemeId } from "@/lib/tauri/commands/window-theme";

export const WINDOW_THEME_STORAGE_KEY = "windowTheme";
export const DEFAULT_WINDOW_THEME: WindowThemeId = "default";

export interface WindowThemeDescriptor {
  readonly id: WindowThemeId;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  /** Makes the webview's root background transparent so the native effect shows. */
  readonly needsTransparency: boolean;
  /** Only available on these platforms (undefined = all). Matched against `getPlatform()`. */
  readonly platforms?: readonly NodeJS.Platform[] | readonly ("darwin" | "win32" | "linux")[];
}

export const WINDOW_THEMES: readonly WindowThemeDescriptor[] = [
  {
    id: "default",
    labelKey: "windowTheme.default",
    icon: Square,
    needsTransparency: false,
  },
  {
    id: "glass",
    labelKey: "windowTheme.glass",
    icon: Sparkles,
    needsTransparency: true,
    platforms: ["darwin"],
  },
] as const;

const WINDOW_THEMES_BY_ID: Record<WindowThemeId, WindowThemeDescriptor> =
  Object.fromEntries(WINDOW_THEMES.map((t) => [t.id, t])) as Record<
    WindowThemeId,
    WindowThemeDescriptor
  >;

export function getWindowThemeDescriptor(id: WindowThemeId): WindowThemeDescriptor {
  return WINDOW_THEMES_BY_ID[id] ?? WINDOW_THEMES_BY_ID[DEFAULT_WINDOW_THEME];
}

export function isWindowThemeSupportedOn(
  id: WindowThemeId,
  platform: string,
): boolean {
  const desc = WINDOW_THEMES_BY_ID[id];
  if (!desc?.platforms) return true;
  return (desc.platforms as readonly string[]).includes(platform);
}

/**
 * Best-effort platform sniff for the renderer. Tauri sets userAgent so we
 * can read it without an extra IPC round-trip (matters during boot).
 */
export function detectRendererPlatform(): "darwin" | "win32" | "linux" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "darwin";
  if (ua.includes("win")) return "win32";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}

export function isValidWindowThemeId(value: unknown): value is WindowThemeId {
  return typeof value === "string" && value in WINDOW_THEMES_BY_ID;
}
