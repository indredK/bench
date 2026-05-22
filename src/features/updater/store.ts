/**
 * Feature Store / 功能状态: store updater state only; 只存更新状态与简单动作.
 */
import { create } from "zustand";
import type { AppUpdateInfo } from "@/lib/tauri/types/updater";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "upToDate"
  | "downloading"
  | "installing"
  | "readyToRestart"
  | "error";

interface UpdaterState {
  open: boolean;
  status: UpdaterStatus;
  currentVersion: string;
  updateInfo: AppUpdateInfo | null;
  error: string;
  downloadedBytes: number;
  totalBytes: number | null;
  lastCheckedAt: number;

  setOpen: (open: boolean) => void;
  setStatus: (status: UpdaterStatus) => void;
  setCurrentVersion: (currentVersion: string) => void;
  setUpdateInfo: (updateInfo: AppUpdateInfo | null) => void;
  setError: (error: string) => void;
  setProgress: (downloadedBytes: number, totalBytes: number | null) => void;
  setLastCheckedAt: (lastCheckedAt: number) => void;
  resetProgress: () => void;
  resetTransientState: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  open: false,
  status: "idle",
  currentVersion: "",
  updateInfo: null,
  error: "",
  downloadedBytes: 0,
  totalBytes: null,
  lastCheckedAt: 0,

  setOpen: (open) => set({ open }),
  setStatus: (status) => set({ status }),
  setCurrentVersion: (currentVersion) => set({ currentVersion }),
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setError: (error) => set({ error }),
  setProgress: (downloadedBytes, totalBytes) => set({ downloadedBytes, totalBytes }),
  setLastCheckedAt: (lastCheckedAt) => set({ lastCheckedAt }),
  resetProgress: () => set({ downloadedBytes: 0, totalBytes: null }),
  resetTransientState: () =>
    set((state) => ({
      open: state.open,
      currentVersion: state.currentVersion,
      lastCheckedAt: state.lastCheckedAt,
      status: "idle",
      updateInfo: null,
      error: "",
      downloadedBytes: 0,
      totalBytes: null,
    })),
}));
