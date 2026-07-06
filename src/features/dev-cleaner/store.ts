/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"
import type { RowSelectionState, SortingState } from "@tanstack/react-table"
import type {
  ScanResult,
  ProjectInfo,
  CleanupCommandDef,
  CustomCleanupProgress,
  CustomCleanupFinalResult,
} from "@/lib/tauri/types/dev-cleaner"
import type { CleanupMessage } from "@/features/dev-cleaner/services/dev-cleaner.use-cases"

export type FilterType = "all" | "nodejs" | "python" | "rust" | "go"

export const filterOptions: FilterType[] = ["all", "nodejs", "python", "rust", "go"]
export const filterTypeMap: Record<Exclude<FilterType, "all">, ProjectInfo["project_type"]> = {
  nodejs: "NodeJs",
  python: "Python",
  rust: "Rust",
  go: "Go",
}

// ── Custom Cleanup State ──

export type CustomCleanupPhase =
  "idle" | "selecting" | "confirming" | "running" | "paused" | "completed"

interface DevCleanerState {
  selectedPath: string
  isScanning: boolean
  scanResult: ScanResult | null
  scanError: string | null
  selectedProjects: RowSelectionState
  isCleaningUp: boolean
  cleanupMessage: CleanupMessage | null
  sorting: SortingState
  filterType: FilterType
  showConfirm: boolean
  showFilterOptions: boolean

  // Custom cleanup
  customCleanupPhase: CustomCleanupPhase
  customCleanupCommands: CleanupCommandDef[]
  selectedCommandIds: Set<string>
  customCleanupProgresses: CustomCleanupProgress[]
  customCleanupResult: CustomCleanupFinalResult | null
  showCustomCleanup: boolean

  setSelectedPath: (path: string) => void
  setFilterType: (type: FilterType) => void
  setShowConfirm: (show: boolean) => void
  setShowFilterOptions: (show: boolean) => void
  setSorting: (sorting: SortingState | ((prev: SortingState) => SortingState)) => void
  setSelectedProjects: (
    selected: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState),
  ) => void
  setCleanupMessage: (message: CleanupMessage | null) => void
  setScanError: (error: string | null) => void
  reset: () => void

  // Custom cleanup actions
  setShowCustomCleanup: (show: boolean) => void
  setCustomCleanupPhase: (phase: CustomCleanupPhase) => void
  setCustomCleanupCommands: (commands: CleanupCommandDef[]) => void
  toggleCustomCleanupCommand: (id: string) => void
  setCustomCleanupProgresses: (progresses: CustomCleanupProgress[]) => void
  updateCustomCleanupProgress: (progress: CustomCleanupProgress) => void
  setCustomCleanupResult: (result: CustomCleanupFinalResult | null) => void
  resetCustomCleanup: () => void
}

export const useDevCleanerStore = create<DevCleanerState>((set) => ({
  selectedPath: "",
  isScanning: false,
  scanResult: null,
  scanError: null,
  selectedProjects: {},
  isCleaningUp: false,
  cleanupMessage: null,
  sorting: [{ id: "cleanupSize", desc: true }],
  filterType: "all",
  showConfirm: false,
  showFilterOptions: true,

  // Custom cleanup
  customCleanupPhase: "idle",
  customCleanupCommands: [],
  selectedCommandIds: new Set(),
  customCleanupProgresses: [],
  customCleanupResult: null,
  showCustomCleanup: false,

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
  setScanError: (error) => set({ scanError: error }),

  reset: () =>
    set({
      selectedPath: "",
      isScanning: false,
      scanResult: null,
      scanError: null,
      selectedProjects: {},
      isCleaningUp: false,
      cleanupMessage: null,
      sorting: [{ id: "cleanupSize", desc: true }],
      filterType: "all",
      showConfirm: false,
      showFilterOptions: true,
    }),

  // Custom cleanup actions
  setShowCustomCleanup: (show) => set({ showCustomCleanup: show }),
  setCustomCleanupPhase: (phase) => set({ customCleanupPhase: phase }),
  setCustomCleanupCommands: (commands) => set({ customCleanupCommands: commands }),
  toggleCustomCleanupCommand: (id) =>
    set((state) => {
      const next = new Set(state.selectedCommandIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedCommandIds: next }
    }),
  setCustomCleanupProgresses: (progresses) => set({ customCleanupProgresses: progresses }),
  updateCustomCleanupProgress: (progress) =>
    set((state) => ({
      customCleanupProgresses: state.customCleanupProgresses.map((p) =>
        p.command_id === progress.command_id ? progress : p,
      ),
    })),
  setCustomCleanupResult: (result) => set({ customCleanupResult: result }),
  resetCustomCleanup: () =>
    set({
      customCleanupPhase: "idle",
      customCleanupCommands: [],
      selectedCommandIds: new Set(),
      customCleanupProgresses: [],
      customCleanupResult: null,
    }),
}))
