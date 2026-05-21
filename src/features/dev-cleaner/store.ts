/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import type { ScanResult, ProjectInfo } from "@/lib/tauri/types/dev-cleaner";
import type { CleanupMessage } from "@/features/dev-cleaner/services/dev-cleaner.use-cases";

export type FilterType = "all" | "nodejs" | "python" | "rust" | "go";

export const filterOptions: FilterType[] = ["all", "nodejs", "python", "rust", "go"];
export const filterTypeMap: Record<Exclude<FilterType, "all">, ProjectInfo["project_type"]> = {
  nodejs: "NodeJs",
  python: "Python",
  rust: "Rust",
  go: "Go",
};

interface DevCleanerState {
  selectedPath: string;
  isScanning: boolean;
  scanResult: ScanResult | null;
  selectedProjects: RowSelectionState;
  isCleaningUp: boolean;
  cleanupMessage: CleanupMessage | null;
  sorting: SortingState;
  filterType: FilterType;
  showConfirm: boolean;
  showFilterOptions: boolean;

  setSelectedPath: (path: string) => void;
  setFilterType: (type: FilterType) => void;
  setShowConfirm: (show: boolean) => void;
  setShowFilterOptions: (show: boolean) => void;
  setSorting: (sorting: SortingState | ((prev: SortingState) => SortingState)) => void;
  setSelectedProjects: (selected: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;
  setCleanupMessage: (message: CleanupMessage | null) => void;
  reset: () => void;
}

export const useDevCleanerStore = create<DevCleanerState>((set) => ({
  selectedPath: "",
  isScanning: false,
  scanResult: null,
  selectedProjects: {},
  isCleaningUp: false,
  cleanupMessage: null,
  sorting: [{ id: "cleanupSize", desc: true }],
  filterType: "all",
  showConfirm: false,
  showFilterOptions: true,

  setSelectedPath: (path) => set({ selectedPath: path }),
  setFilterType: (type) => set({ filterType: type }),
  setShowConfirm: (show) => set({ showConfirm: show }),
  setShowFilterOptions: (show) => set({ showFilterOptions: show }),
  setSorting: (sorting) =>
    set((state) => ({
      sorting: typeof sorting === "function" ? sorting(state.sorting) : sorting,
    })),
  setSelectedProjects: (selected) =>
    set((state) => ({
      selectedProjects:
        typeof selected === "function" ? selected(state.selectedProjects) : selected,
    })),
  setCleanupMessage: (message) => set({ cleanupMessage: message }),

  reset: () =>
    set({
      selectedPath: "",
      isScanning: false,
      scanResult: null,
      selectedProjects: {},
      isCleaningUp: false,
      cleanupMessage: null,
      sorting: [{ id: "cleanupSize", desc: true }],
      filterType: "all",
      showConfirm: false,
      showFilterOptions: true,
    }),
}));
