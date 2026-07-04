import { lazy, Suspense } from "react"
import { Users } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const AccountManagerPage = lazy(() => import("@/features/account-manager/page"))

export const accountManagerFeature: AppFeature = {
  id: "account-manager",
  path: "/account-manager",
  labelKey: "sidebar.accountManager",
  icon: <Users size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <AccountManagerPage />
    </Suspense>
  ),
  desktopOnly: true,
  platforms: ["macos"],
}
