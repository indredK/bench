import { lazy, Suspense } from "react"
import { Cable } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const IntegrationsPage = lazy(() => import("@/features/integrations/page"))

export const integrationsFeature: AppFeature = {
  id: "integrations",
  path: "/integrations",
  labelKey: "sidebar.integrations",
  icon: <Cable size={18} />,
  render: (feature) => (
    <Suspense fallback={<FeatureFallback />}>
      <IntegrationsPage key={feature.id} />
    </Suspense>
  ),
  desktopOnly: true,
}
