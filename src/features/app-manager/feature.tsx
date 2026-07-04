import { lazy, Suspense } from "react";
import { AppWindow } from "lucide-react";
import { FeatureFallback } from "@/features/FeatureFallback";
import type { AppFeature } from "@/features/types";

const AppManager = lazy(() => import("@/features/app-manager/page"));

export const appManagerFeature: AppFeature = {
  id: "app-manager",
  path: "/app-manager",
  labelKey: "sidebar.appManager",
  icon: <AppWindow size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <AppManager active feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
};
