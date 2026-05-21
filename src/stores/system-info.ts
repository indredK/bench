import { create } from "zustand";
import type { SystemInfoData } from "@/lib/tauri/types/port-manager";
import { systemInfoRepository } from "@/features/system-info/services/system-info.repository";
import { isDesktopRuntime } from "@/platform/runtime";

interface SystemInfoState {
  loading: boolean;
  systemInfo: SystemInfoData | null;
  error: string;
  fetched: boolean;

  loadSystemInfo: () => Promise<void>;
  reset: () => void;
}

function getBrowserInfo(): SystemInfoData {
  const ua = navigator.userAgent;
  let browserName = "Unknown";
  let browserVersion = "Unknown";

  if (ua.includes("Firefox")) {
    browserName = "Firefox";
    const match = ua.match(/Firefox\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes("Edg")) {
    browserName = "Edge";
    const match = ua.match(/Edg\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes("Chrome")) {
    browserName = "Chrome";
    const match = ua.match(/Chrome\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  } else if (ua.includes("Safari")) {
    browserName = "Safari";
    const match = ua.match(/Version\/(\d+\.\d+)/);
    if (match) browserVersion = match[1];
  }

  let platform = "Unknown";
  if (ua.includes("Win")) platform = "Windows";
  else if (ua.includes("Mac")) platform = "MacOS";
  else if (ua.includes("Linux")) platform = "Linux";
  else if (ua.includes("Android")) platform = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS";

  return {
    os_name: platform,
    os_version: "Unknown",
    kernel_version: "Unknown",
    hostname: "Unknown",
    cpu_brand: "Unknown",
    cpu_cores: 0,
    total_memory: 0,
    available_memory: 0,
    used_memory: 0,
    memory_usage_percent: 0,
    uptime_seconds: 0,
    arch: (navigator as any).userAgentData?.platform || navigator.platform || "Unknown",
    model_name: "",
    distribution: "",
    browser_name: browserName,
    browser_version: browserVersion,
    language: navigator.language,
    screen_resolution: `${window.screen.width} x ${window.screen.height}`,
  };
}

export const useSystemInfoStore = create<SystemInfoState>((set) => ({
  loading: true,
  systemInfo: null,
  error: "",
  fetched: false,

  loadSystemInfo: async () => {
    set({ loading: true, error: "" });
    try {
      if (isDesktopRuntime()) {
        const info = await systemInfoRepository.getSystemInfo();
        set({ systemInfo: info, loading: false, fetched: true });
      } else {
        const browserInfo = getBrowserInfo();
        set({ systemInfo: browserInfo, loading: false, fetched: true });
      }
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
