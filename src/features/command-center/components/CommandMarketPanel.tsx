/**
 * Command Market Panel / 命令市场: 只做渲染.
 *
 * 一行 = 一条市场命令：名称/说明 | 类型 | 版本（已装 → 最新）| 状态 | 安装 · 更新 · 卸载。
 * 命令脚本由独立仓库 command-market 发布，更新命令不需要升级 Bench 客户端。
 */
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, Store } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CommandMarketListing, MarketCommandSummary } from "@/lib/tauri/types/command-center"

function StatusBadge({ entry }: { entry: MarketCommandSummary }) {
  const { t } = useTranslation()
  if (entry.upgradable) {
    return (
      <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
        {t("commandCenter.market.upgradable")}
      </Badge>
    )
  }
  if (entry.installed) {
    return <Badge variant="secondary">{t("commandCenter.market.installed")}</Badge>
  }
  return (
    <span className="text-muted-foreground text-xs">{t("commandCenter.market.notInstalled")}</span>
  )
}

function VersionCell({ entry }: { entry: MarketCommandSummary }) {
  if (entry.upgradable && entry.installedVersion) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs">
        <span className="text-muted-foreground">{entry.installedVersion}</span>
        <ArrowRight size={11} className="text-muted-foreground" aria-hidden />
        <span className="font-semibold">{entry.version}</span>
      </span>
    )
  }
  return <span className="font-mono text-xs">{entry.version}</span>
}

export function CommandMarketPanel({
  listing,
  loading,
  error,
  busyId,
  onRefresh,
  onInstall,
  onUninstall,
}: {
  listing: CommandMarketListing | null
  loading: boolean
  error: string | null
  busyId: string | null
  onRefresh: () => void
  onInstall: (entry: MarketCommandSummary) => void
  onUninstall: (entry: MarketCommandSummary) => void
}) {
  const { t } = useTranslation()

  if (loading && listing === null) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
        <Loader2 size={16} className="animate-spin" />
        {t("common.loading")}
      </div>
    )
  }

  if (error && listing === null) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        <p className="font-medium">{t("commandCenter.market.loadFailed")}</p>
        <p className="font-mono text-xs break-all opacity-80">{error}</p>
        <p className="text-xs opacity-80">{t("commandCenter.market.loadFailedHint")}</p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw size={14} />
          {t("commandCenter.market.refresh")}
        </Button>
      </div>
    )
  }

  const commands = listing?.commands ?? []

  return (
    <div className="flex flex-col gap-2">
      {listing?.localStoreError ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{t("commandCenter.market.localStoreError")}</p>
            <p className="font-mono break-all opacity-80">{listing.localStoreError}</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700 dark:text-red-300">
          {t("commandCenter.market.refreshFailed")}：<span className="font-mono">{error}</span>
        </p>
      ) : null}

      {commands.length === 0 ? (
        <div className="border-border text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
          <Store size={28} className="opacity-40" />
          <p className="text-sm">{t("commandCenter.market.empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="bg-muted/50 text-muted-foreground grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_5.5rem_11rem] items-center gap-3 px-4 py-2 text-xs font-medium">
            <span>{t("commandCenter.market.col.name")}</span>
            <span>{t("commandCenter.market.col.kind")}</span>
            <span>{t("commandCenter.market.col.version")}</span>
            <span>{t("commandCenter.market.col.status")}</span>
            <span className="text-right">{t("commandCenter.market.col.actions")}</span>
          </div>
          {commands.map((entry) => {
            const busy = busyId === entry.id
            const anyBusy = busyId !== null
            const canUninstall = entry.installedVersion !== null
            return (
              <div
                key={entry.id}
                className="grid grid-cols-[minmax(0,1fr)_6.5rem_9rem_5.5rem_11rem] items-center gap-3 border-t px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={entry.title}>
                    {entry.title}
                  </p>
                  <p
                    className="text-muted-foreground truncate text-xs"
                    title={entry.description || entry.id}
                  >
                    {entry.description || entry.id}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">
                  {t(`commandCenter.kind.${entry.kind}`)}
                </span>
                <VersionCell entry={entry} />
                <StatusBadge entry={entry} />
                <div className="flex justify-end gap-1.5">
                  {!entry.installed || entry.upgradable ? (
                    <Button size="sm" disabled={anyBusy} onClick={() => onInstall(entry)}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                      {entry.upgradable
                        ? t("commandCenter.market.update")
                        : t("commandCenter.market.install")}
                    </Button>
                  ) : null}
                  {canUninstall ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={anyBusy}
                      onClick={() => onUninstall(entry)}
                    >
                      {t("commandCenter.market.uninstall")}
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {listing?.source ? (
        <p className="text-muted-foreground truncate text-[11px]" title={listing.source}>
          {t("commandCenter.market.sourceLabel")}：{listing.source}
          {listing.updatedAt ? ` · ${listing.updatedAt}` : ""}
        </p>
      ) : null}
    </div>
  )
}
