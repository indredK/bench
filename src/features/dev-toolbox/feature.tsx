/**
 * Feature Descriptor / 功能描述: Dev Toolbox — 从旧 SystemSettings 中移出的 DevTools/Diagnostics/Info.
 */
import { Wrench } from "lucide-react";
import DevToolbox from "@/features/dev-toolbox/page";
import type { AppFeature } from "@/features/types";

export const devToolboxFeature: AppFeature = {
  id: "dev-toolbox",
  path: "/dev-toolbox",
  labelKey: "devToolbox.title",
  icon: <Wrench size={18} />,
  render: (feature) => <DevToolbox feature={feature} />,
  desktopOnly: false,
};
