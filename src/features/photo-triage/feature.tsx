import { lazy, Suspense } from "react"
import { Image } from "lucide-react"
import { FeatureFallback } from "@/features/FeatureFallback"
import type { AppFeature } from "@/features/types"

const PhotoTriagePage = lazy(() => import("@/features/photo-triage/page"))

/**
 * Photo Triage / 照片筛选（旁路独立模块，macOS-only）.
 * 对齐迁移方案 §6.3：Windows 隐藏导航，直达路由显示 unsupported。
 */
export const photoTriageFeature: AppFeature = {
  id: "photo-triage",
  path: "/photo-triage",
  labelKey: "sidebar.photoTriage",
  icon: <Image size={18} />,
  render: () => (
    <Suspense fallback={<FeatureFallback />}>
      <PhotoTriagePage />
    </Suspense>
  ),
  desktopOnly: true,
  platforms: ["macos"],
}
