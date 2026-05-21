import { Zap } from "lucide-react";
import PortManager from "@/features/port-manager/page";
import { usePortManagerStore } from "@/stores/port-manager";
import type { AppFeature } from "@/features/types";

export const portManagerFeature: AppFeature = {
  id: "port-manager",
  path: "/",
  labelKey: "sidebar.portManager",
  icon: <Zap size={18} />,
  render: () => <PortManager />,
  refresh: () => usePortManagerStore.getState().rescanAll(),
  desktopOnly: true,
};
