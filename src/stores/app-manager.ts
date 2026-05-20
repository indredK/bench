import { create } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
import { scanInstalledApps } from "@/lib/tauri/commands";
import type { AppInfo, AppScanResult } from "@/lib/tauri/types";

export type AppFilterKey = "all" | "user" | "system" | "launchable";

export const APP_FILTER_OPTIONS = [
  { key: "all" as const, labelKey: "appManager.filterAll" },
  { key: "user" as const, labelKey: "appManager.filterUser" },
  { key: "system" as const, labelKey: "appManager.filterSystem" },
  { key: "launchable" as const, labelKey: "appManager.filterLaunchable" },
];

interface AppManagerState {
  apps: AppInfo[];
  loading: boolean;
  error: string;
  searchQuery: string;
  activeFilter: AppFilterKey;
  sorting: SortingState;
  scanned: boolean;
  result: AppScanResult | null;

  setSearchQuery: (query: string) => void;
  setActiveFilter: (filter: AppFilterKey) => void;
  setSorting: (sorting: Updater<SortingState>) => void;
  scanApps: () => Promise<void>;
  reset: () => void;
}

export const useAppManagerStore = create<AppManagerState>((set, get) => ({
  apps: [],
  loading: false,
  error: "",
  searchQuery: "",
  activeFilter: "all",
  sorting: [{ id: "name", desc: false }],
  scanned: false,
  result: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSorting: (sorting: Updater<SortingState>) =>
    set((state) => ({
      sorting: typeof sorting === "function" ? sorting(state.sorting) : sorting,
    })),

  scanApps: async () => {
    const { loading } = get();
    if (loading) return;

    set({ loading: true, error: "", apps: [], result: null });

    if (!isTauri()) {
      set({ scanned: true, loading: false });
      return;
    }

    try {
      const result = await scanInstalledApps();
      set({
        apps: result.apps,
        result,
        scanned: true,
        loading: false,
      });
    } catch (e) {
      console.warn("[AppManager] Failed to scan apps:", e);
      set({
        apps: [],
        result: null,
        error: String(e) || "Failed to scan applications",
        scanned: true,
        loading: false,
      });
    }
  },

  reset: () =>
    set({
      apps: [],
      loading: false,
      error: "",
      searchQuery: "",
      activeFilter: "all",
      sorting: [{ id: "name", desc: false }],
      scanned: false,
      result: null,
    }),
}));
