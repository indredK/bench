import { create } from "zustand";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  cleanupProjects as runCleanupProjects,
  scanDevProjects,
  stopDevProjectScan,
} from "@/lib/tauri/commands";
import type { ScanResult, ProjectInfo } from "@/lib/tauri/types";

export type FilterType = "all" | "nodejs" | "python" | "rust" | "go";

export const filterOptions: FilterType[] = ["all", "nodejs", "python", "rust", "go"];
export const filterTypeMap: Record<Exclude<FilterType, "all">, ProjectInfo["project_type"]> = {
  nodejs: "NodeJs",
  python: "Python",
  rust: "Rust",
  go: "Go",
};

interface CleanupMessage {
  type: "success" | "error";
  text: string;
}

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
  handleSelectPath: () => Promise<void>;
  handleScan: () => Promise<void>;
  handleStopScan: () => Promise<void>;
  handleCleanup: () => Promise<void>;
  reset: () => void;
}

export const useDevCleanerStore = create<DevCleanerState>((set, get) => ({
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

  handleSelectPath: async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Directory to Scan",
      });
      if (selected && typeof selected === "string") {
        set({ selectedPath: selected });
      }
    } catch (error) {
      alert(`Failed to open directory dialog: ${error}`);
    }
  },

  handleScan: async () => {
    const { selectedPath } = get();
    if (!selectedPath) return;

    set({ isScanning: true, showConfirm: false, showFilterOptions: true });

    if (!isTauri()) {
      set({
        cleanupMessage: {
          type: "error",
          text: "Scanning is only available in the desktop app",
        },
        isScanning: false,
      });
      return;
    }

    try {
      const result = await scanDevProjects(selectedPath);
      set({
        scanResult: result,
        selectedProjects: {},
        isScanning: false,
        cleanupMessage: result.aborted
          ? {
              type: "success" as const,
              text: `Scan stopped. Found ${result.total_projects} projects`,
            }
          : null,
      });
    } catch (error) {
      set({
        cleanupMessage: {
          type: "error",
          text: `Scan failed: ${error}`,
        },
        isScanning: false,
      });
    }
  },

  handleStopScan: async () => {
    try {
      await stopDevProjectScan();
    } catch (error) {
      console.error("Failed to stop scan:", error);
    }
  },

  handleCleanup: async () => {
    const { selectedProjects, scanResult } = get();
    const selectedCount = Object.values(selectedProjects).filter(Boolean).length;
    if (selectedCount === 0) return;

    set({ showConfirm: false, isCleaningUp: true, cleanupMessage: null });

    try {
      const projectsToCleanup =
        scanResult?.projects.filter((project) => selectedProjects[project.path]) ?? [];
      const result = await runCleanupProjects(projectsToCleanup);

      if (result.success) {
        set({
          cleanupMessage: { type: "success", text: `Cleaned up ${result.cleaned_size} bytes` },
          selectedProjects: {},
        });
        setTimeout(() => {
          get().handleScan();
        }, 1000);
      } else {
        set({
          cleanupMessage: {
            type: "error",
            text: result.errors?.join(", ") || "Unknown error",
          },
        });
      }
    } catch (error) {
      set({
        cleanupMessage: { type: "error", text: `Cleanup failed: ${error}` },
      });
    } finally {
      set({ isCleaningUp: false });
    }
  },

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
