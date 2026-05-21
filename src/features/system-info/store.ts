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

  setLoading: (loading: boolean) => void;
  setSystemInfo: (systemInfo: SystemInfoData | null) => void;
  setError: (error: string) => void;
  setFetched: (fetched: boolean) => void;
  reset: () => void;
}

export const useSystemInfoStore = create<SystemInfoState>((set) => ({
  loading: true,
  systemInfo: null,
  error: "",
  fetched: false,

  setLoading: (loading) => set({ loading }),
  setSystemInfo: (systemInfo) => set({ systemInfo }),
  setError: (error) => set({ error }),
  setFetched: (fetched) => set({ fetched }),
  reset: () => set({ loading: true, systemInfo: null, error: "", fetched: false }),
}));
