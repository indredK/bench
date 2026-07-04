import { lazy, Suspense } from "react"
import { Zap } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const PortManager = lazy(() => import("@/features/port-manager/page"))

export const portManagerFeature: AppFeature = {
  id: "port-manager",
  path: "/",
  labelKey: "sidebar.portManager",
  icon: <Zap size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <PortManager feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
}
