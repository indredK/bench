/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"
import type { SortingState, Updater } from "@tanstack/react-table"
import type { EnvTool } from "@/lib/tauri/types/env-detector"

interface EnvDetectorState {
  tools: EnvTool[]
  loading: boolean
  scanning: boolean
  error: string
  searchQuery: string
  filters: Record<string, string>
  sorting: SortingState
  scanned: boolean
  showAllCommands: boolean
  viewMode: "table" | "grid"

  setSearchQuery: (query: string) => void
  setFilters: (
    filters: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
  ) => void
  setSorting: (sorting: Updater<SortingState>) => void
  setShowAllCommands: (show: boolean) => void
  setViewMode: (mode: "table" | "grid") => void
  clearFilters: () => void
  reset: () => void
}

export const useEnvDetectorStore = create<EnvDetectorState>((set) => ({
  tools: [],
  loading: false,
  scanning: false,
  error: "",
  searchQuery: "",
  filters: {},
  sorting: [{ id: "name", desc: false }],
  scanned: false,
  showAllCommands: false,
  viewMode: "table",

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSorting: (sorting: Updater<SortingState>) =>
    set((state) => ({
      sorting: typeof sorting === "function" ? sorting(state.sorting) : sorting,
    })),
  setShowAllCommands: (show) => set({ showAllCommands: show }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFilters: (filters) =>
    set((state) => ({
      filters: typeof filters === "function" ? filters(state.filters) : filters,
    })),

  clearFilters: () => set({ filters: {} }),

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
      viewMode: "table",
    }),
}))
