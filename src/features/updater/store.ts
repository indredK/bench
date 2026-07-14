/**
 * Feature Store / 功能状态: store updater state only; 只存更新状态与简单动作.
 */
import { create } from "zustand"
import type { AppUpdateInfo } from "@/lib/tauri/types/updater"
import type { UpdaterErrorInfo } from "@/features/updater/error-classifier"

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "upToDate"
  | "downloading"
  | "cancelling"
  | "installing"
  | "readyToRestart"
  | "error"

interface UpdaterState {
  open: boolean
  status: UpdaterStatus
  currentVersion: string
  updateInfo: AppUpdateInfo | null
  error: string
  errorInfo: UpdaterErrorInfo | null
  downloadedBytes: number
  totalBytes: number | null
  lastCheckedAt: number
  autoCheckEnabled: boolean
  autoCheckFailureCount: number
  lastAutoCheckFailureAt: number
  policyHydrated: boolean

  setOpen: (open: boolean) => void
  setStatus: (status: UpdaterStatus) => void
  setCurrentVersion: (currentVersion: string) => void
  setUpdateInfo: (updateInfo: AppUpdateInfo | null) => void
  setError: (error: string) => void
  setErrorInfo: (errorInfo: UpdaterErrorInfo | null) => void
  setProgress: (downloadedBytes: number, totalBytes: number | null) => void
  setLastCheckedAt: (lastCheckedAt: number) => void
  resetProgress: () => void
  resetTransientState: () => void
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  open: false,
  status: "idle",
  currentVersion: "",
  updateInfo: null,
  error: "",
  errorInfo: null,
  downloadedBytes: 0,
  totalBytes: null,
  lastCheckedAt: 0,
  autoCheckEnabled: true,
  autoCheckFailureCount: 0,
  lastAutoCheckFailureAt: 0,
  policyHydrated: false,

  setOpen: (open) => set({ open }),
  setStatus: (status) => set({ status }),
  setCurrentVersion: (currentVersion) => set({ currentVersion }),
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setError: (error) => set({ error }),
  setErrorInfo: (errorInfo) => set({ errorInfo }),
  setProgress: (downloadedBytes, totalBytes) => set({ downloadedBytes, totalBytes }),
  setLastCheckedAt: (lastCheckedAt) => set({ lastCheckedAt }),
  resetProgress: () => set({ downloadedBytes: 0, totalBytes: null }),
  resetTransientState: () =>
    set((state) => ({
      open: state.open,
      currentVersion: state.currentVersion,
      lastCheckedAt: state.lastCheckedAt,
      autoCheckEnabled: state.autoCheckEnabled,
      autoCheckFailureCount: state.autoCheckFailureCount,
      lastAutoCheckFailureAt: state.lastAutoCheckFailureAt,
      policyHydrated: state.policyHydrated,
      status: "idle",
      updateInfo: null,
      error: "",
      errorInfo: null,
      downloadedBytes: 0,
      totalBytes: null,
    })),
}))
