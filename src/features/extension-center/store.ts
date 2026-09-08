/**
 * Store / 状态: hold extension list + market state; 只持有状态与简单 setter.
 */
import { create } from "zustand"

import type {
  ExtensionSummary,
  MarketInstallPreview,
  MarketListing,
} from "@/lib/tauri/types/extension-center"
import type { AppErrorShape } from "@/lib/tauri/errors"

export interface ExtensionCenterState {
  items: ExtensionSummary[]
  loading: boolean
  error: AppErrorShape | null
  busyIds: string[]
  /** market 目录（P4）；registry 未配置时为 null + marketError。 */
  marketListing: MarketListing | null
  marketLoading: boolean
  marketError: AppErrorShape | null
  /** 信任披露弹窗待确认的安装预览（prepare 成功后置入）。 */
  pendingPreview: MarketInstallPreview | null
  /** 信任弹窗的确认/取消进行中。 */
  committing: boolean
  setItems: (items: ExtensionSummary[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: AppErrorShape | null) => void
  setBusy: (id: string, busy: boolean) => void
  setMarketListing: (listing: MarketListing | null) => void
  setMarketLoading: (loading: boolean) => void
  setMarketError: (error: AppErrorShape | null) => void
  setPendingPreview: (preview: MarketInstallPreview | null) => void
  setCommitting: (committing: boolean) => void
}

export const useExtensionCenterStore = create<ExtensionCenterState>((set) => ({
  items: [],
  loading: true,
  error: null,
  busyIds: [],
  marketListing: null,
  marketLoading: false,
  marketError: null,
  pendingPreview: null,
  committing: false,
  setItems: (items) => set({ items }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setBusy: (id, busy) =>
    set((state) => ({
      busyIds: busy
        ? [...new Set([...state.busyIds, id])]
        : state.busyIds.filter((value) => value !== id),
    })),
  setMarketListing: (marketListing) => set({ marketListing }),
  setMarketLoading: (marketLoading) => set({ marketLoading }),
  setMarketError: (marketError) => set({ marketError }),
  setPendingPreview: (pendingPreview) => set({ pendingPreview }),
  setCommitting: (committing) => set({ committing }),
}))
