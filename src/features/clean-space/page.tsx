/**
 * Page View / 页面视图: horizontal tab bar + content area; 顶部标签栏 + 下方内容.
 */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Trash2, HardDrive, FolderOpen, History } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  useCleanSpaceController,
  type CleanSpaceTool,
} from "@/features/clean-space/hooks/useCleanSpaceController"
import { DevProjectCleanerTool } from "@/features/clean-space/components/tools/DevProjectCleanerTool"
import { StorageOverview } from "@/features/clean-space/components/StorageOverview"
import { CleanupRecords } from "@/features/clean-space/components/CleanupRecords"
import { CategoryDetail } from "@/features/clean-space/components/CategoryDetail"
import { CleanupProgress } from "@/features/clean-space/components/CleanupProgress"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import { CustomFolderCleanerTool } from "@/features/clean-space/components/tools/CustomFolderCleanerTool"

interface CleanSpacePageProps {
  feature?: { desktopOnly?: boolean }
}

/** Drill-down: show CategoryDetail when a category is selected, otherwise show overview */
function OverviewSection() {
  const selectedCategoryId = useCleanSpaceStore((s) => s.selectedCategoryId)
  const setSelectedCategoryId = useCleanSpaceStore((s) => s.setSelectedCategoryId)

  // ESC returns to overview
  useEffect(() => {
    if (!selectedCategoryId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCategoryId(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedCategoryId, setSelectedCategoryId])

  if (selectedCategoryId) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <CategoryDetail />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <StorageOverview />
      <CleanupProgress />
    </div>
  )
}

export default function CleanSpacePage({ feature }: CleanSpacePageProps) {
  const { t } = useTranslation()
  const { activeTool, setActiveTool } = useCleanSpaceController()

  const tools: { id: CleanSpaceTool; labelKey: string; icon: typeof HardDrive }[] = [
    { id: "overview", labelKey: "cleanSpace.tools.overview", icon: HardDrive },
    { id: "dev-project", labelKey: "cleanSpace.tools.devProject", icon: Trash2 },
    { id: "custom-folder", labelKey: "cleanSpace.tools.customFolder", icon: FolderOpen },
    { id: "records", labelKey: "cleanSpace.tools.records", icon: History },
  ]

  return (
    <RuntimeFeatureGate
      feature={feature}
      title={t("cleanSpace.title")}
      icon={<HardDrive size={32} className="opacity-40" />}
    >
      <div className="flex h-full flex-col">
        {/* Horizontal tab bar */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-4">
          {tools.map(({ id, labelKey, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              onClick={() => setActiveTool(id)}
              className={cn(
                "-mb-[1px] flex items-center gap-1.5 rounded-none border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                activeTool === id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
              )}
            >
              <Icon size={13} />
              {t(labelKey)}
            </Button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
          {activeTool === "overview" && <OverviewSection />}
          {activeTool === "dev-project" && <DevProjectCleanerTool />}
          {activeTool === "custom-folder" && <CustomFolderCleanerTool />}
          {activeTool === "records" && <CleanupRecords />}
        </div>
      </div>
    </RuntimeFeatureGate>
  )
}
