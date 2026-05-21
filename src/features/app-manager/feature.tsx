import { AppWindow } from "lucide-react";
import AppManager from "@/features/app-manager/page";
import { useAppManagerStore } from "@/stores/app-manager";
import type { AppFeature } from "@/features/types";

export const appManagerFeature: AppFeature = {
  id: "app-manager",
  path: "/app-manager",
  labelKey: "sidebar.appManager",
  icon: <AppWindow size={18} />,
  render: () => <AppManager active />,
  refresh: () => useAppManagerStore.getState().scanApps(),
  desktopOnly: true,
};
