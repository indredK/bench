/**
 * Installed Panel / 已安装插件: 只做渲染.
 *
 * 一行 = 一个已安装插件：名称 | 版本（有更新时显示 已装 → 最新）| 来源 | 状态 | 打开 · 更新 · 启停 · 卸载。
 */
import { useTranslation } from "react-i18next"
import { ArrowRight, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"
import type { AppErrorShape } from "@/lib/tauri/errors"

import { selectMetadata, useResolvedLocale } from "../lib/metadata"

const GRID = "grid-cols-[minmax(0,1fr)_9rem_4.5rem_6.5rem_15rem]"

export function InstalledPanel({
  items,
  loading,
  error,
  busyIds,
  updates,
  updating,
  onRefresh,
  onOpen,
  onToggleEnabled,
  onUpdate,
  onUninstall,
}: {
  items: ExtensionSummary[]
  loading: boolean
  error: AppErrorShape | null
  busyIds: string[]
  /** id → 市场上可更新到的版本。 */
  updates: Record<string, string>
  /** 正在 prepare 的更新（`id@version`）。 */
  updating: (id: string, version: string) => boolean
  onRefresh: () => void
  onOpen: (id: string) => void
  onToggleEnabled: (item: ExtensionSummary) => void
  onUpdate: (id: string, version: string) => void
  onUninstall: (item: ExtensionSummary) => void
}) {
  const { t } = useTranslation()
  const locale = useResolvedLocale()

  if (loading && items.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
        <Loader2 size={16} className="animate-spin" />
        {t("extensionCenter.loading")}
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{t("extensionCenter.loadFailed")}</p>
        <p className="mt-1 font-mono text-xs opacity-80">
          [{error.code}] {error.message}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRefresh}>
          {t("extensionCenter.retry")}
        </Button>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">{t("extensionCenter.empty")}</p>
        <p className="text-muted-foreground mt-1 text-xs">{t("extensionCenter.emptyHint")}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div
        className={`bg-muted/50 text-muted-foreground grid ${GRID} items-center gap-3 px-4 py-2 text-xs font-medium`}
      >
        <span>{t("extensionCenter.name")}</span>
        <span>{t("extensionCenter.version")}</span>
        <span>{t("extensionCenter.distributionLabel")}</span>
        <span>{t("extensionCenter.status")}</span>
        <span className="text-right">{t("extensionCenter.actions")}</span>
      </div>
      {items.map((item) => {
        const busy = busyIds.includes(item.id)
        const target = updates[item.id]
        const preparing = target ? updating(item.id, target) : false
        return (
          <div key={item.id} className={`grid ${GRID} items-center gap-3 border-t px-4 py-2.5`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selectMetadata(locale, { zh: item.displayZh, en: item.displayEn }, item.id)}
              </p>
              <p className="text-muted-foreground truncate text-xs">{item.id}</p>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              {target ? (
                <>
                  <span className="text-muted-foreground">{item.version}</span>
                  <ArrowRight size={11} className="text-muted-foreground" aria-hidden />
                  <span className="font-semibold">{target}</span>
                </>
              ) : (
                item.version
              )}
            </span>
            <Badge variant="outline">
              {item.distribution === "bundled"
                ? t("extensionCenter.distribution.bundled")
                : t("extensionCenter.distribution.market")}
            </Badge>
            <div className="flex flex-col items-start gap-1">
              <Badge
                variant="outline"
                className={
                  item.enabled
                    ? "border-green-300 text-green-700 dark:text-green-300"
                    : "border-amber-300 text-amber-700 dark:text-amber-300"
                }
              >
                {item.enabled ? t("extensionCenter.enabled") : t("extensionCenter.disabled")}
              </Badge>
              {!item.compatible && (
                <Badge variant="destructive">{t("extensionCenter.incompatible")}</Badge>
              )}
            </div>
            <div className="flex justify-end gap-1.5">
              {target ? (
                <Button
                  size="sm"
                  disabled={busy || preparing}
                  onClick={() => onUpdate(item.id, target)}
                >
                  {preparing ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t("extensionCenter.market.update")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !item.enabled}
                onClick={() => onOpen(item.id)}
              >
                {t("extensionCenter.open")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onToggleEnabled(item)}
              >
                {item.enabled ? t("extensionCenter.disable") : t("extensionCenter.enable")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => onUninstall(item)}
              >
                {t("extensionCenter.uninstall")}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
