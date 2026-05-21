import { Monitor } from "lucide-react";
import SystemInfo from "@/features/system-info/page";
import { useSystemInfoStore } from "@/features/system-info/store";
import type { AppFeature } from "@/features/types";

export const systemInfoFeature: AppFeature = {
  id: "system-info",
  path: "/system-info",
  labelKey: "sidebar.systemInfo",
  icon: <Monitor size={18} />,
  render: () => <SystemInfo active />,
  refresh: () => useSystemInfoStore.getState().loadSystemInfo(),
};
