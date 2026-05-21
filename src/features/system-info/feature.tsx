/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
import { Monitor } from "lucide-react";
import SystemInfo from "@/features/system-info/page";
import { systemInfoOperations } from "@/features/system-info/operations";
import type { AppFeature } from "@/features/types";

export const systemInfoFeature: AppFeature = {
  id: "system-info",
  path: "/system-info",
  labelKey: "sidebar.systemInfo",
  icon: <Monitor size={18} />,
  render: () => <SystemInfo active />,
  refresh: () => systemInfoOperations.loadSystemInfo(),
};
