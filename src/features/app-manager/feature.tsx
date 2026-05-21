/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
import { AppWindow } from "lucide-react";
import AppManager from "@/features/app-manager/page";
import type { AppFeature } from "@/features/types";

export const appManagerFeature: AppFeature = {
  id: "app-manager",
  path: "/app-manager",
  labelKey: "sidebar.appManager",
  icon: <AppWindow size={18} />,
  render: (feature) => <AppManager active feature={feature} />,
  desktopOnly: true,
};
