/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useTranslation } from "react-i18next"
import { RefreshCw, X } from "lucide-react"
import { ToolbarButton } from "@/components/ui/toolbar-button"
import { AppManagerToolbar } from "@/features/app-manager/components/AppManagerToolbar"

interface AppManagerActionBarProps {
  searchQuery: string
  searchPlaceholder: string
  loading: boolean
  onSearchQueryChange: (query: string) => void
  onScanApps: () => void
}

export function AppManagerActionBar({
  searchQuery,
  searchPlaceholder,
  loading,
  onSearchQueryChange,
  onScanApps,
}: AppManagerActionBarProps) {
  const { t } = useTranslation()
  return (
    <AppManagerToolbar
      searchQuery={searchQuery}
      searchPlaceholder={searchPlaceholder}
      onSearchQueryChange={onSearchQueryChange}
      searchDisabled={loading}
      rightContent={
        <div className="flex items-center gap-1.5">
          <ToolbarButton
            icon={loading ? <X size={15} /> : <RefreshCw size={15} />}
            tooltip={loading ? t("appManager.cancelScan") : t("appManager.refresh")}
            onClick={onScanApps}
          />
        </div>
      }
    />
  )
}
