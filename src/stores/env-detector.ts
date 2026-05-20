import { create } from "zustand";
import type { SortingState, Updater } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { detectEnvTools } from "@/lib/tauri/commands";
import type { EnvTool } from "@/lib/tauri/types";

interface EnvDetectorState {
  tools: EnvTool[];
  loading: boolean;
  scanning: boolean;
  error: string;
  searchQuery: string;
  filters: Record<string, string>;
  sorting: SortingState;
  scanned: boolean;
  showAllCommands: boolean;

  setSearchQuery: (query: string) => void;
  setFilters: (filters: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setSorting: (sorting: Updater<SortingState>) => void;
  setShowAllCommands: (show: boolean) => void;
  handleFilterChange: (key: string, value: string) => void;
  clearFilters: () => void;
  loadTools: () => Promise<void>;
  reset: () => void;
}

export const useEnvDetectorStore = create<EnvDetectorState>((set, get) => ({
  tools: [],
  loading: false,
  scanning: false,
  error: "",
  searchQuery: "",
  filters: {},
  sorting: [{ id: "name", desc: false }],
  scanned: false,
  showAllCommands: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSorting: (sorting: Updater<SortingState>) =>
    set((state) => ({
      sorting: typeof sorting === "function" ? sorting(state.sorting) : sorting,
    })),
  setShowAllCommands: (show) => set({ showAllCommands: show }),
  setFilters: (filters) =>
    set((state) => ({
      filters: typeof filters === "function" ? filters(state.filters) : filters,
    })),

  handleFilterChange: (key, value) =>
    set((state) => {
      if (state.filters[key] === value) {
        const next = { ...state.filters };
        delete next[key];
        return { filters: next };
      }
      return { filters: { ...state.filters, [key]: value } };
    }),

  clearFilters: () => set({ filters: {} }),

  loadTools: async () => {
    const { scanning } = get();
    if (scanning) return;

    set({ loading: true, scanning: true, error: "", tools: [] });

    if (!isTauri()) {
      set({ scanned: true, loading: false, scanning: false });
      return;
    }

    let unlisten: UnlistenFn | null = null;

    try {
      unlisten = await listen<{ tools: EnvTool[]; unavailable: EnvTool[] }>("env-scan-done", (event) => {
        set({
          tools: [...event.payload.tools, ...event.payload.unavailable],
          loading: false,
          scanning: false,
          scanned: true,
        });
        unlisten?.();
      });

      await detectEnvTools();
    } catch (e) {
      console.warn("[EnvDetector] Failed to detect tools:", e);
      set({ tools: [], error: "Failed to detect tools", loading: false, scanning: false, scanned: true });
      unlisten?.();
    }
  },

  reset: () =>
    set({
      tools: [],
      loading: false,
      scanning: false,
      error: "",
      searchQuery: "",
      filters: {},
      sorting: [{ id: "name", desc: false }],
      scanned: false,
      showAllCommands: false,
    }),
}));
