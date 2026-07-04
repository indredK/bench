import { lazy, Suspense } from "react"
import { Cpu } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const HardwareComparePage = lazy(() => import("@/features/hardware/page"))

export const hardwareFeature: AppFeature = {
  id: "hardware",
  path: "/hardware",
  labelKey: "sidebar.hardwareQuery",
  icon: <Cpu size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <HardwareComparePage />
    </Suspense>
  ),
  platforms: ["macos"],
}
