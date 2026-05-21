/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
import { Trash2 } from "lucide-react";
import DevCleaner from "@/features/dev-cleaner/page";
import { devCleanerOperations } from "@/features/dev-cleaner/operations";
import type { AppFeature } from "@/features/types";

export const devCleanerFeature: AppFeature = {
  id: "dev-cleaner",
  path: "/dev-cleaner",
  labelKey: "sidebar.devCleaner",
  icon: <Trash2 size={18} />,
  render: (feature) => <DevCleaner feature={feature} />,
  refresh: () => devCleanerOperations.scan(),
  desktopOnly: true,
};
