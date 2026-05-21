import { Box } from "lucide-react";
import EnvDetector from "@/features/env-detector/page";
import { envDetectorOperations } from "@/features/env-detector/operations";
import type { AppFeature } from "@/features/types";

export const envDetectorFeature: AppFeature = {
  id: "env-detector",
  path: "/env-detector",
  labelKey: "sidebar.envDetector",
  icon: <Box size={18} />,
  render: (feature) => <EnvDetector active feature={feature} />,
  refresh: () => envDetectorOperations.loadTools(),
  desktopOnly: true,
};
