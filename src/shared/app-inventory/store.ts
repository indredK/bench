/** Shared installed-application inventory state. */
import { create } from "zustand"

import type { AppScanResult } from "@/lib/tauri/types/app-manager"

export interface InventoryProgress {
  taskId: string
  current: number
  completed: number
  total: number | null
  stage: string
  cancellable: boolean
}

export type InventoryStatus = "idle" | "loading" | "refreshing" | "ready" | "partial" | "error"

interface AppInventoryState {
  snapshot: AppScanResult | null
  status: InventoryStatus
  progress: InventoryProgress | null
  error: string | null
  stale: boolean
  setState: (patch: Partial<Omit<AppInventoryState, "setState">>) => void
}

export const useAppInventoryStore = create<AppInventoryState>((set) => ({
  snapshot: null,
  status: "idle",
  progress: null,
  error: null,
  stale: false,
  setState: (patch) => set(patch),
}))
