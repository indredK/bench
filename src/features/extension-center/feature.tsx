import { lazy, Suspense } from "react"
import { Puzzle } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const ExtensionCenterPage = lazy(() => import("@/features/extension-center/page"))

export const extensionCenterFeature: AppFeature = {
  id: "extension-center",
  path: "/extension-center",
  labelKey: "sidebar.extensionCenter",
  icon: <Puzzle size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <ExtensionCenterPage />
    </Suspense>
  ),
}
