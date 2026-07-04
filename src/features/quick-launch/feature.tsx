import { lazy, Suspense } from "react";
import { LayoutGrid } from "lucide-react";
import { FeatureFallback } from "@/features/FeatureFallback";
import type { AppFeature } from "@/features/types";

const QuickLaunch = lazy(() => import("@/features/quick-launch/page"));

export const quickLaunchFeature: AppFeature = {
  id: "quick-launch",
  path: "/quick-launch",
  labelKey: "sidebar.quickLaunch",
  icon: <LayoutGrid size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <QuickLaunch active feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
};
