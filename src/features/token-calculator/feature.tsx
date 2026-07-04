import { lazy, Suspense } from "react"
import { Coins } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const TokenCalculatorPage = lazy(() => import("@/features/token-calculator/page"))

export const tokenCalculatorFeature: AppFeature = {
  id: "token-calculator",
  path: "/token-calculator",
  labelKey: "sidebar.tokenCalculator",
  icon: <Coins size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <TokenCalculatorPage />
    </Suspense>
  ),
}
