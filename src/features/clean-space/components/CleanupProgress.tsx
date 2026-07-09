/**
 * Cleanup Progress / 清理进度: shows execution progress, real-time logs,
 * and result summary after completion. Modeled after clean-space-prototype.html result view.
 */
import { useTranslation } from "react-i18next"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import { cn, formatSize } from "@/lib/utils"

export function CleanupProgress() {
  const { t, i18n } = useTranslation()
  const progress = useCleanSpaceStore((s) => s.cleanupProgress)
  const setSelectedCategoryId = useCleanSpaceStore((s) => s.setSelectedCategoryId)
  const resetCleanupProgress = useCleanSpaceStore((s) => s.resetCleanupProgress)

  if (!progress.active) return null

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const handleDone = () => {
    resetCleanupProgress()
    setSelectedCategoryId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress card */}
      {!progress.finished && (
        <Card>
          <CardContent className="flex flex-col items-center py-6 text-center">
            <div className="text-3xl font-semibold tabular-nums">{pct}%</div>
            <div className="text-muted-foreground mt-1 text-sm">
              {progress.currentItem || t("cleanSpace.progress.preparing")}
            </div>
            <div className="bg-muted mt-5 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-2 text-xs tabular-nums">
              {progress.done} / {progress.total} {t("cleanSpace.progress.itemsUnit")}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution log */}
      {progress.logs.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <CardTitle className="mb-3 text-sm">{t("cleanSpace.progress.logTitle")}</CardTitle>
            <div className="max-h-64 overflow-y-auto rounded-lg bg-neutral-900 p-3.5 font-mono text-xs text-neutral-100">
              {progress.logs.map((log, idx) => {
                const time = new Date(log.timestamp).toLocaleTimeString(i18n.language, { hour12: false })
                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-2 py-0.5 animate-in fade-in",
                      log.status === "warn" && "text-red-300",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        log.status === "ok" && "bg-green-500",
                        log.status === "warn" && "bg-red-500",
                        log.status === "skip" && "bg-neutral-500",
                      )}
                    />
                    <span className="text-neutral-500 shrink-0">{time}</span>
                    <span>
                      {log.status === "warn"
                        ? t("cleanSpace.progress.deleted")
                        : t("cleanSpace.progress.cleaned")}
                      ：{log.name} · {t("cleanSpace.progress.freed")} {formatSize(log.size_bytes)}
                      {log.status === "warn" && t("cleanSpace.progress.irreversible")}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result summary */}
      {progress.finished && progress.result && (
        <Card>
          <CardContent className="py-4">
            <CardTitle className="mb-4 text-sm">{t("cleanSpace.progress.resultTitle")}</CardTitle>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-xl py-4 text-center">
                <div className="text-lg font-semibold tabular-nums">{progress.result.items}</div>
                <div className="text-muted-foreground text-xs">{t("cleanSpace.progress.cleanedItems")}</div>
              </div>
              <div className="bg-muted/50 rounded-xl py-4 text-center">
                <div className="text-primary text-lg font-semibold tabular-nums">{formatSize(progress.result.freedBytes)}</div>
                <div className="text-muted-foreground text-xs">{t("cleanSpace.progress.freedSpace")}</div>
              </div>
              <div className="bg-muted/50 rounded-xl py-4 text-center">
                <div className="text-lg font-semibold tabular-nums">{progress.result.paths}</div>
                <div className="text-muted-foreground text-xs">{t("cleanSpace.progress.pathCount")}</div>
              </div>
              <div className="bg-muted/50 rounded-xl py-4 text-center">
                <div className={cn("text-lg font-semibold tabular-nums", progress.result.highCount > 0 && "text-red-500")}>
                  {progress.result.highCount}
                </div>
                <div className="text-muted-foreground text-xs">{t("cleanSpace.progress.highRiskItems")}</div>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="outline" size="sm" onClick={handleDone}>
                {t("cleanSpace.progress.again")}
              </Button>
              <Button variant="default" size="sm" onClick={handleDone}>
                {t("cleanSpace.progress.done")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Finished header */}
      {progress.finished && (
        <div className="flex items-center gap-2">
          <CheckCircle size={18} className="text-green-500" />
          <span className="text-sm font-semibold">{t("cleanSpace.progress.allDone")}</span>
        </div>
      )}
    </div>
  )
}
