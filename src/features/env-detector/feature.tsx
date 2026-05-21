/**
 * Feature Descriptor / 功能描述: expose route metadata; 只暴露路由元数据.
 */
import { Box } from "lucide-react";
import EnvDetector from "@/features/env-detector/page";
import type { AppFeature } from "@/features/types";

export const envDetectorFeature: AppFeature = {
  id: "env-detector",
  path: "/env-detector",
  labelKey: "sidebar.envDetector",
  icon: <Box size={18} />,
  render: (feature) => <EnvDetector active feature={feature} />,
  desktopOnly: true,
};
