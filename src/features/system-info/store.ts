/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";

interface SystemInfoState {
  loading: boolean;
  systemInfo: SystemInfoData | null;
  error: string;
  fetched: boolean;

  reset: () => void;
}

export const useSystemInfoStore = create<SystemInfoState>((set) => ({
  loading: true,
  systemInfo: null,
  error: "",
  fetched: false,

  reset: () => set({ loading: true, systemInfo: null, error: "", fetched: false }),
}));
