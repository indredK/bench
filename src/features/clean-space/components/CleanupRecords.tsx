/**
 * Cleanup Records / 清理记录: full-height list with compact header.
 */
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Badge } from "@/components/ui/badge"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import { loadRecords } from "@/features/clean-space/services/clean-space.use-cases"
import { formatSize } from "@/lib/utils"

export function CleanupRecords() {
  const { t, i18n } = useTranslation()
  const records = useCleanSpaceStore((s) => s.records)
  const [isLoading, setIsLoading] = useState(false)

  const handleLoad = useCallback(async () => {
    setIsLoading(true)
    try {
      await loadRecords()
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    handleLoad()
  }, [handleLoad])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between py-2">
        <h3 className="text-sm font-medium">{t("cleanSpace.records.title")}</h3>
        <Button variant="ghost" size="icon-sm" onClick={handleLoad} disabled={isLoading}>
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>
      </div>

      <ScrollableArea
        className="flex min-h-0 flex-1 flex-col"
        wrapperClassName="flex min-h-0 flex-1"
      >
        {isLoading && records.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 py-12 text-sm">
            <Loader2 size={14} className="animate-spin" />
            {t("cleanSpace.records.loading")}
          </div>
        ) : records.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center py-12 text-sm">
            {t("cleanSpace.records.empty")}
          </div>
        ) : (
          <div className="space-y-1.5">
            {records.map((record) => (
              <div key={record.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" title={record.title}>
                      {record.title}
                    </span>
                    <Badge
                      variant={record.status === "ok" ? "secondary" : "destructive"}
                      className="shrink-0 text-[10px]"
                    >
                      {t(`cleanSpace.records.status${record.status === "ok" ? "Ok" : "Warn"}`)}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-0.5 truncate text-xs">
                    {record.scope} &middot;{" "}
                    {new Date(record.timestamp * 1000).toLocaleString(i18n.language)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                    +{formatSize(record.freed_bytes)}
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {record.items} {t("cleanSpace.records.items")}
                    {record.high_risk_count > 0 && (
                      <span className="ml-1 text-red-500">
                        ({record.high_risk_count} {t("cleanSpace.records.highRisk")})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollableArea>
    </div>
  )
}
