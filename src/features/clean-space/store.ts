/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 * Clean Space 伞状 store：activeTool / overview / records / categorySelection。
 * 复杂业务逻辑（macOS 余量计算等）放在 lib/ 下，store 只负责保存与简单追加。
 */
import { create } from "zustand"
import type {
  StorageOverview,
  StorageCategory,
  StorageItem,
  CleanupRecord,
} from "@/lib/tauri/types/clean-space"

export type CleanSpaceTool = "overview" | "dev-project" | "custom-folder" | "records"

export interface CleanupProgressItem {
  name: string
  size_bytes: number
  risk_level: string
  status: "ok" | "failed" | "skip"
  /** Wall-clock millis when this log entry was produced. */
  timestamp: number
}

interface CleanSpaceState {
  activeTool: CleanSpaceTool
  overview: StorageOverview | null
  records: CleanupRecord[]
  isScanning: boolean
  scanError: string | null
  /** Disk info received at scan start (consumed by lib/mac-os-remainder) */
  scanDiskInfo: { diskTotal: number; diskUsed: number } | null
  /** Number of categories received so far (for knowing when scan is done) */
  scannedCategoryCount: number
  selectedCategoryId: string | null
  isCleaning: boolean
  cleanupProgress: {
    active: boolean
    total: number
    done: number
    currentItem: string
    logs: CleanupProgressItem[]
    finished: boolean
    result: {
      items: number
      failed: number
      freedBytes: number
      paths: number
      highCount: number
    } | null
  }

  setActiveTool: (tool: CleanSpaceTool) => void
  setOverview: (overview: StorageOverview | null) => void
  /** Initialize streaming scan: clear categories, store disk info */
  initStreamScan: (diskTotal: number, diskUsed: number) => void
  /** Append a category (dedup by id). macOS remainder is computed in use-cases via lib/. */
  addScannedCategory: (category: StorageCategory) => void
  /** Mark streaming scan as complete */
  finishStreamScan: () => void
  setRecords: (records: CleanupRecord[]) => void
  addRecord: (record: CleanupRecord) => void
  setIsScanning: (v: boolean) => void
  setScanError: (error: string | null) => void
  setSelectedCategoryId: (id: string | null) => void
  setIsCleaning: (v: boolean) => void
  setCleanupProgress: (p: Partial<CleanSpaceState["cleanupProgress"]>) => void
  resetCleanupProgress: () => void
  /** Optimistically remove cleaned items from a category and update its total_bytes */
  removeCleanedItems: (categoryId: string, itemIds: string[], freedBytes: number) => void
  /** Set items for a specific category (used for lazy loading) */
  setCategoryItems: (categoryId: string, items: StorageItem[]) => void
}

export const useCleanSpaceStore = create<CleanSpaceState>((set) => ({
  activeTool: "overview",
  overview: null,
  records: [],
  isScanning: false,
  scanError: null,
  scanDiskInfo: null,
  scannedCategoryCount: 0,
  selectedCategoryId: null,
  isCleaning: false,
  cleanupProgress: {
    active: false,
    total: 0,
    done: 0,
    currentItem: "",
    logs: [],
    finished: false,
    result: null,
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setOverview: (overview) => set({ overview }),

  initStreamScan: (diskTotal, diskUsed) =>
    set({
      isScanning: true,
      scanError: null,
      scanDiskInfo: { diskTotal, diskUsed },
      scannedCategoryCount: 0,
      overview: { disk_total_bytes: diskTotal, categories: [] },
      selectedCategoryId: null,
    }),

  addScannedCategory: (category) =>
    set((state) => {
      if (!state.overview) return state
      const existing = state.overview.categories.find((c) => c.id === category.id)
      const mergedCategory = existing
        ? {
            ...category,
            items: category.items.length > 0 ? category.items : existing.items,
          }
        : category
      const withoutDup = state.overview.categories.filter((c) => c.id !== category.id)
      const categories = [...withoutDup, mergedCategory]
      return {
        overview: { ...state.overview, categories },
        scannedCategoryCount: state.scannedCategoryCount + 1,
      }
    }),

  finishStreamScan: () => set({ isScanning: false }),

  setRecords: (records) => set({ records }),
  addRecord: (record) => set((state) => ({ records: [record, ...state.records] })),
  setIsScanning: (isScanning) => set({ isScanning }),
  setScanError: (scanError) => set({ scanError }),
  setSelectedCategoryId: (id) => set({ selectedCategoryId: id }),
  setIsCleaning: (v) => set({ isCleaning: v }),
  setCleanupProgress: (p) =>
    set((state) => ({ cleanupProgress: { ...state.cleanupProgress, ...p } })),
  resetCleanupProgress: () =>
    set({
      cleanupProgress: {
        active: false,
        total: 0,
        done: 0,
        currentItem: "",
        logs: [],
        finished: false,
        result: null,
      },
    }),

  removeCleanedItems: (categoryId, itemIds, freedBytes) =>
    set((state) => {
      if (!state.overview) return state
      const categories = state.overview.categories.map((cat) => {
        if (cat.id !== categoryId) return cat
        const remainingItems = cat.items.filter((item) => !itemIds.includes(item.id))
        return {
          ...cat,
          items: remainingItems,
          total_bytes: Math.max(0, cat.total_bytes - freedBytes),
        }
      })
      return { overview: { ...state.overview, categories } }
    }),

  setCategoryItems: (categoryId, items) =>
    set((state) => {
      if (!state.overview) return state
      const categories = state.overview.categories.map((cat) => {
        if (cat.id !== categoryId) return cat
        return { ...cat, items }
      })
      return { overview: { ...state.overview, categories } }
    }),
}))
