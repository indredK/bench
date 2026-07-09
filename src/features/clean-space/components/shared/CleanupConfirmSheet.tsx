/**
 * Cleanup Confirm Sheet / 清理确认弹窗: glass-effect confirmation dialog showing
 * impact scope, command code blocks, risk banners and dual-confirmation checkboxes.
 * Modeled after the clean-space-prototype.html glass sheet design.
 */
import { useState, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ChevronRight, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { canCleanStorageItem, getProtectionReason } from "@/features/clean-space/lib/cleanable"
import { cn, formatSize } from "@/lib/utils"
import type { StorageItem } from "@/lib/tauri/types/clean-space"
import type { RiskLevel } from "@/lib/tauri/types/dev-cleaner"

const RISK_CONFIG: Record<
  RiskLevel,
  { labelKey: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  safe: {
    labelKey: "cleanSpace.risk.safe",
    color: "#34C759",
    bgClass: "bg-green-500/10",
    textClass: "text-green-700 dark:text-green-300",
    borderClass: "border-green-500/30",
  },
  low: {
    labelKey: "cleanSpace.risk.low",
    color: "#30B0C7",
    bgClass: "bg-cyan-500/10",
    textClass: "text-cyan-700 dark:text-cyan-300",
    borderClass: "border-cyan-500/30",
  },
  medium: {
    labelKey: "cleanSpace.risk.medium",
    color: "#FF9500",
    bgClass: "bg-orange-500/10",
    textClass: "text-orange-700 dark:text-orange-300",
    borderClass: "border-orange-500/30",
  },
  high: {
    labelKey: "cleanSpace.risk.high",
    color: "#FF3B30",
    bgClass: "bg-red-500/10",
    textClass: "text-red-700 dark:text-red-300",
    borderClass: "border-red-500/30",
  },
}

interface CleanupConfirmSheetProps {
  open: boolean
  onClose: () => void
  items: StorageItem[]
  onConfirm: () => void | Promise<void>
  loading?: boolean
}

export function CleanupConfirmSheet({
  open,
  onClose,
  items,
  onConfirm,
  loading,
}: CleanupConfirmSheetProps) {
  const { t } = useTranslation()
  const [ack1, setAck1] = useState(false)
  const [ack2, setAck2] = useState(false)
  const [expandedCmds, setExpandedCmds] = useState<Set<string>>(new Set())
  const cleanableItems = useMemo(() => items.filter(canCleanStorageItem), [items])

  const stats = useMemo(() => {
    const totalBytes = cleanableItems.reduce((s, i) => s + i.size_bytes, 0)
    const paths = new Set(cleanableItems.map((i) => i.path))
    const hasHigh = cleanableItems.some((i) => i.risk_level === "high")
    const hasMedium = cleanableItems.some((i) => i.risk_level === "medium")
    return { totalBytes, pathCount: paths.size, hasHigh, hasMedium }
  }, [cleanableItems])

  const sortedItems = useMemo(
    () =>
      [...cleanableItems].sort((a, b) => {
        const order = { safe: 0, low: 1, medium: 2, high: 3 }
        return order[a.risk_level] - order[b.risk_level] || b.size_bytes - a.size_bytes
      }),
    [cleanableItems],
  )

  const toggleCmd = useCallback((id: string) => {
    setExpandedCmds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const canConfirm = sortedItems.length > 0 && ack1 && (!stats.hasHigh || ack2)

  // Reset state when sheet opens
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setAck1(false)
        setAck2(false)
        setExpandedCmds(new Set())
        onClose()
      }
    },
    [onClose],
  )

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return
    void Promise.resolve(onConfirm())
  }, [canConfirm, onConfirm])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[10px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleOpenChange(false)
      }}
    >
      <div className="border-border/60 bg-background/90 flex max-h-[78vh] w-[520px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-[20px] backdrop-saturate-[180%]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold">{t("cleanSpace.confirmCleanupTitle")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("cleanSpace.confirmCleanupDesc2")}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => handleOpenChange(false)}>
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Impact box */}
          <div className="bg-muted/50 mb-3.5 flex flex-wrap gap-x-5 gap-y-1 rounded-lg px-3.5 py-3 text-xs">
            <div>
              {t("cleanSpace.impact.delete")} <b>{sortedItems.length}</b>{" "}
              {t("cleanSpace.impact.items")}
            </div>
            <div>
              {t("cleanSpace.impact.free")} <b>{formatSize(stats.totalBytes)}</b>
            </div>
            <div>
              {t("cleanSpace.impact.paths")}{" "}
              <b className={cn(stats.hasHigh && "font-semibold text-red-600 dark:text-red-400")}>
                {stats.pathCount}
              </b>{" "}
              {t("cleanSpace.impact.pathCount")}
            </div>
          </div>

          {/* Risk banner */}
          {stats.hasHigh && (
            <div className="mb-3.5 flex gap-2.5 rounded-lg bg-red-500/10 p-3 text-xs leading-relaxed text-red-700 dark:text-red-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <b>{t("cleanSpace.riskWarning.irreversible")}</b>
                {t("cleanSpace.riskWarning.highDesc")}
              </div>
            </div>
          )}
          {!stats.hasHigh && stats.hasMedium && (
            <div className="mb-3.5 flex gap-2.5 rounded-lg bg-orange-500/10 p-3 text-xs leading-relaxed text-orange-700 dark:text-orange-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <b>{t("cleanSpace.riskWarning.irreversible")}</b>
                {t("cleanSpace.riskWarning.mediumDesc")}
              </div>
            </div>
          )}

          {/* Command blocks */}
          <div className="flex flex-col gap-2.5">
            {sortedItems.map((item) => {
              const riskConf = RISK_CONFIG[item.risk_level]
              const isOpen = expandedCmds.has(item.id)
              const protectionReason = getProtectionReason(item)
              return (
                <div key={item.id} className="border-border/50 overflow-hidden rounded-lg border">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <div
                      className="h-6 w-0.5 shrink-0 rounded-full"
                      style={{ backgroundColor: riskConf.color }}
                    />
                    <code className="text-muted-foreground flex-1 truncate font-mono text-xs">
                      $ {item.command}
                    </code>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        riskConf.bgClass,
                        riskConf.textClass,
                      )}
                    >
                      {t(riskConf.labelKey)}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                      {formatSize(item.size_bytes)}
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                      onClick={() => toggleCmd(item.id)}
                    >
                      <ChevronRight
                        size={15}
                        className={cn("transition-transform", isOpen && "rotate-90")}
                      />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-border/30 bg-muted/30 border-t px-3.5 py-2.5">
                      <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-0.5 text-xs">
                        <span className="text-muted-foreground">{t("cleanSpace.detail.name")}</span>
                        <span className="font-mono">{item.name}</span>
                        <span className="text-muted-foreground">{t("cleanSpace.detail.path")}</span>
                        <span className="font-mono">{item.path}</span>
                        <span className="text-muted-foreground">
                          {t("cleanSpace.detail.files")}
                        </span>
                        <span className="font-mono">{item.files || "—"}</span>
                        <span className="text-muted-foreground">{t("cleanSpace.detail.risk")}</span>
                        <span className="font-mono">{t(riskConf.labelKey)}</span>
                      </div>
                      <div className="border-border/30 bg-muted/50 mt-2 rounded-md border px-2.5 py-2 font-mono text-xs break-all">
                        $ {item.command}
                      </div>
                      {protectionReason && (
                        <div className="bg-muted/20 mt-2 rounded-md px-2.5 py-2 text-xs">
                          <b>{t("cleanSpace.detail.riskReason")}</b>
                          {protectionReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-border/30 bg-muted/20 border-t px-6 py-3.5">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={ack1}
              onClick={() => setAck1(!ack1)}
              className="flex cursor-pointer items-center gap-2.5 text-left text-sm select-none"
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  ack1 ? "border-primary bg-primary" : "border-border bg-background",
                )}
              >
                {ack1 && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="#fff"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              {t("cleanSpace.confirm.ack1")}
            </button>
            {stats.hasHigh && (
              <button
                type="button"
                role="checkbox"
                aria-checked={ack2}
                onClick={() => setAck2(!ack2)}
                className="flex cursor-pointer items-center gap-2.5 text-left text-sm font-medium text-red-700 select-none dark:text-red-300"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    ack2 ? "border-red-500 bg-red-500" : "border-border bg-background",
                  )}
                >
                  {ack2 && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="#fff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {t("cleanSpace.confirm.ack2")}
              </button>
            )}
            <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                {t("cleanSpace.cancelCleanup")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirm}
                disabled={!canConfirm || loading}
              >
                {loading && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {loading ? t("cleanSpace.cleaning") : t("cleanSpace.confirmCleanup")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
