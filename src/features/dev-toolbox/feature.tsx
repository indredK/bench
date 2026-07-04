import { lazy, Suspense } from "react"
import { Wrench } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const DevToolbox = lazy(() => import("@/features/dev-toolbox/page"))

export const devToolboxFeature: AppFeature = {
  id: "dev-toolbox",
  path: "/dev-toolbox",
  labelKey: "devToolbox.title",
  icon: <Wrench size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <DevToolbox feature={feature} />
    </Suspense>
  ),
  desktopOnly: false,
}
