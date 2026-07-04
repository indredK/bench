import { lazy, Suspense } from "react";
import { Trash2 } from "lucide-react";
import { FeatureFallback } from "@/features/FeatureFallback";
import type { AppFeature } from "@/features/types";

const DevCleaner = lazy(() => import("@/features/dev-cleaner/page"));

export const devCleanerFeature: AppFeature = {
  id: "dev-cleaner",
  path: "/dev-cleaner",
  labelKey: "sidebar.devCleaner",
  icon: <Trash2 size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <DevCleaner feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
};
