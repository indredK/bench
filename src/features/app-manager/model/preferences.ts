/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { SortingState } from "@tanstack/react-table"

export type AppFilterKey = "all" | "user" | "system" | "launchable" | "managed"

export type MarketplaceFilterKey = "all" | "pending" | "installed"

export interface PersistedPreferences {
  activeFilter: AppFilterKey
  sorting: SortingState
}

const VALID_FILTER_KEYS = new Set<AppFilterKey>(["all", "user", "system", "launchable", "managed"])

export function normalizeFilterKey(value: unknown): AppFilterKey {
  if (value === "uninstalled" || value === "installList") return "all"
  return typeof value === "string" && VALID_FILTER_KEYS.has(value as AppFilterKey)
    ? (value as AppFilterKey)
    : "all"
}

export function normalizeAppManagerPreferences(value: unknown): PersistedPreferences {
  const prefs = (value ?? {}) as Partial<PersistedPreferences> & {
    activeFilter?: unknown
  }

  return {
    activeFilter: normalizeFilterKey(prefs.activeFilter),
    sorting: Array.isArray(prefs.sorting) ? prefs.sorting : [{ id: "name", desc: false }],
  }
}

export function normalizeAppManagerViewMode(value: unknown): "table" | "grid" {
  return value === "grid" ? "grid" : "table"
}
