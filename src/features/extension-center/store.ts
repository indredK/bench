/**
 * Store / 状态: hold extension list state; 只持有插件列表状态.
 */
import { create } from "zustand"

import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"
import type { AppErrorShape } from "@/lib/tauri/errors"

export interface ExtensionCenterState {
  items: ExtensionSummary[]
  loading: boolean
  error: AppErrorShape | null
  busyIds: string[]
  setItems: (items: ExtensionSummary[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: AppErrorShape | null) => void
  setBusy: (id: string, busy: boolean) => void
}

export const useExtensionCenterStore = create<ExtensionCenterState>((set) => ({
  items: [],
  loading: true,
  error: null,
  busyIds: [],
  setItems: (items) => set({ items }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setBusy: (id, busy) =>
    set((state) => ({
      busyIds: busy
        ? [...new Set([...state.busyIds, id])]
        : state.busyIds.filter((value) => value !== id),
    })),
}))
