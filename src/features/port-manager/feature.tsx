/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
import { Zap } from "lucide-react";
import PortManager from "@/features/port-manager/page";
import { portManagerOperations } from "@/features/port-manager/operations";
import type { AppFeature } from "@/features/types";

export const portManagerFeature: AppFeature = {
  id: "port-manager",
  path: "/",
  labelKey: "sidebar.portManager",
  icon: <Zap size={18} />,
  render: (feature) => <PortManager feature={feature} />,
  refresh: () => portManagerOperations.rescanAll(),
  desktopOnly: true,
};
