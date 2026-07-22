import { lazy, Suspense } from "react"
import { Network } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const NetworkProbePage = lazy(() => import("@/features/network-probe/page"))

export const networkProbeFeature: AppFeature = {
  id: "network-probe",
  path: "/network-probe",
  labelKey: "sidebar.networkProbe",
  icon: <Network size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <NetworkProbePage />
    </Suspense>
  ),
  desktopOnly: true,
}
