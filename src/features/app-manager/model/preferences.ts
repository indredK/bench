/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { SortingState } from "@tanstack/react-table";

export type AppFilterKey =
  | "all"
  | "user"
  | "system"
  | "launchable"
  | "managed"
  | "upgradable"
  | "installList";

interface PersistedPreferences {
  activeFilter: AppFilterKey;
  sorting: SortingState;
}

const PREF_KEY = "app-manager-preferences";
const VIEW_MODE_KEY = "view-mode:app-manager";

const VALID_FILTER_KEYS = new Set<AppFilterKey>([
  "all",
  "user",
  "system",
  "launchable",
  "managed",
  "upgradable",
  "installList",
]);

function normalizeFilterKey(value: unknown): AppFilterKey {
  if (value === "uninstalled") return "installList";
  return typeof value === "string" && VALID_FILTER_KEYS.has(value as AppFilterKey)
    ? (value as AppFilterKey)
    : "all";
}

export function loadAppManagerPreferences(): PersistedPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) {
      const prefs = JSON.parse(raw) as Partial<PersistedPreferences> & {
        activeFilter?: unknown;
      };
      return {
        activeFilter: normalizeFilterKey(prefs.activeFilter),
        sorting: Array.isArray(prefs.sorting)
          ? prefs.sorting
          : [{ id: "name", desc: false }],
      };
    }
  } catch {
    /* ignore */
  }

  return { activeFilter: "all", sorting: [{ id: "name", desc: false }] };
}

export function saveAppManagerPreferences(prefs: PersistedPreferences) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadAppManagerViewMode(): "table" | "grid" {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === "grid" ? "grid" : "table";
  } catch {
    return "table";
  }
}

export function saveAppManagerViewMode(mode: "table" | "grid") {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
