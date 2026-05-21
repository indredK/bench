import { create } from "zustand";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";
import { systemInfoUseCases } from "@/features/system-info/services/system-info.use-cases";

interface SystemInfoState {
  loading: boolean;
  systemInfo: SystemInfoData | null;
  error: string;
  fetched: boolean;

  loadSystemInfo: () => Promise<void>;
  reset: () => void;
}

export const useSystemInfoStore = create<SystemInfoState>((set) => ({
  loading: true,
  systemInfo: null,
  error: "",
  fetched: false,

  loadSystemInfo: async () => {
    set({ loading: true, error: "" });
    try {
      const info = await systemInfoUseCases.loadSystemInfo();
      set({ systemInfo: info, loading: false, fetched: true });
    } catch (e) {
      set({
        error: typeof e === "string" ? e : "Failed to load system info",
        loading: false,
        fetched: true,
      });
    }
  },

  reset: () => set({ loading: true, systemInfo: null, error: "", fetched: false }),
}));
