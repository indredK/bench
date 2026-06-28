/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
import { Settings } from "lucide-react";
import SystemSettings from "@/features/system-settings/page";
import type { AppFeature } from "@/features/types";

export const systemSettingsFeature: AppFeature = {
  id: "system-settings",
  path: "/system-settings",
  labelKey: "sidebar.systemSettings",
  icon: <Settings size={18} />,
  render: (feature) => <SystemSettings feature={feature} />,
  desktopOnly: true,
};
