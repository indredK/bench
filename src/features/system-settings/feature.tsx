import { lazy, Suspense } from "react";
import { Settings } from "lucide-react";
import { FeatureFallback } from "@/features/FeatureFallback";
import type { AppFeature } from "@/features/types";

const SystemSettings = lazy(() => import("@/features/system-settings/page"));

export const systemSettingsFeature: AppFeature = {
  id: "system-settings",
  path: "/system-settings",
  labelKey: "sidebar.systemSettings",
  icon: <Settings size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <SystemSettings feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
  platforms: ["macos"],
};
