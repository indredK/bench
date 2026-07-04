import { lazy, Suspense } from "react"
import { BookText } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const TerminologyPage = lazy(() => import("@/features/terminology/page"))

export const terminologyFeature: AppFeature = {
  id: "terminology",
  path: "/terminology",
  labelKey: "sidebar.terminology",
  icon: <BookText size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <TerminologyPage />
    </Suspense>
  ),
}
