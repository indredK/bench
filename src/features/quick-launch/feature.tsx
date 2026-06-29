/**
 * Feature Descriptor / 功能描述
 */
import { LayoutGrid } from "lucide-react";
import QuickLaunch from "@/features/quick-launch/page";
import type { AppFeature } from "@/features/types";

export const quickLaunchFeature: AppFeature = {
  id: "quick-launch",
  path: "/quick-launch",
  labelKey: "sidebar.quickLaunch",
  icon: <LayoutGrid size={18} />,
  render: (feature) => <QuickLaunch active feature={feature} />,
  desktopOnly: true,
};
