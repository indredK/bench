/**
 * Feature Descriptor / 功能描述: register route and sidebar entry; 只注册路由与侧边栏入口.
 */
import { lazy, Suspense } from "react"
import { Trash2 } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const CleanSpacePage = lazy(() => import("@/features/clean-space/page"))

export const cleanSpaceFeature: AppFeature = {
  id: "clean-space",
  path: "/clean-space",
  labelKey: "sidebar.cleanSpace",
  icon: <Trash2 size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <CleanSpacePage feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
}
