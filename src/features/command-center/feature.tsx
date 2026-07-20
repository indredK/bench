import { lazy, Suspense } from "react"
import { Terminal } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const CommandCenter = lazy(() => import("@/features/command-center/page"))

export const commandCenterFeature: AppFeature = {
  id: "command-center",
  path: "/command-center",
  labelKey: "sidebar.commandCenter",
  icon: <Terminal size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <CommandCenter feature={feature} />
    </Suspense>
  ),
  desktopOnly: true,
}
