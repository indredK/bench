import { lazy, Suspense } from "react";
import { Box } from "lucide-react";
import { FeatureFallback } from "@/features/FeatureFallback";
import type { AppFeature } from "@/features/types";

const EnvDetector = lazy(() => import("@/features/env-detector/page"));

export const envDetectorFeature: AppFeature = {
  id: "env-detector",
  path: "/env-detector",
  labelKey: "sidebar.envDetector",
  icon: <Box size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <EnvDetector active feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
};
