import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Store } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { installMarketCommand, listMarketCommands } from "@/lib/tauri/commands/command-center"
import type { CommandMarketListing, MarketCommandSummary } from "@/lib/tauri/types/command-center"
import { parseCommandError } from "@/lib/tauri/errors"

/**
 * 命令市场弹窗（P5）：浏览市场源命令并一键安装进本地卡片库。
 * 市场源由宿主 env 配置（BENCH_COMMAND_MARKET_URL / _DIR）；
 * 未配置 → 空态提示（能力保留，不影响本地命令）。
 */
export function CommandMarketDialog({
  open,
  onOpenChange,
  onInstalled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstalled: () => void
}) {
  const { t } = useTranslation()
  const [listing, setListing] = useState<CommandMarketListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setListing(await listMarketCommands())
    } catch (rawError) {
      setError(parseCommandError(rawError).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const install = useCallback(
    async (summary: MarketCommandSummary) => {
      setBusyId(summary.id)
      try {
        await installMarketCommand(summary.id)
        toast.success(t("commandCenter.market.toastInstalled"))
        onInstalled()
        await load()
      } catch (rawError) {
        toast.error(parseCommandError(rawError).message || t("commandCenter.market.installFailed"))
      } finally {
        setBusyId(null)
      }
    },
    [load, onInstalled, t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store size={16} />
            {t("commandCenter.market.title")}
          </DialogTitle>
          {listing?.source && (
            <DialogDescription className="break-all">
              {t("commandCenter.market.sourceLabel")}：{listing.source}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && listing === null ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : listing && listing.commands.length > 0 ? (
          <div className="max-h-80 space-y-2 overflow-auto">
            {listing.commands.map((summary) => (
              <div
                key={summary.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{summary.title}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      v{summary.version}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {summary.kind}
                    </span>
                    {summary.installed && (
                      <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[11px] text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
                        {t("commandCenter.market.installed")}
                      </span>
                    )}
                    {summary.upgradable && (
                      <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
                        {t("commandCenter.market.upgradable")}
                      </span>
                    )}
                  </div>
                  {summary.description && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                      {summary.description}
                    </p>
                  )}
                </div>
                {!summary.installed || summary.upgradable ? (
                  <Button
                    size="sm"
                    className="shrink-0"
                    disabled={busyId !== null}
                    onClick={() => void install(summary)}
                  >
                    {busyId === summary.id ? <Loader2 size={14} className="animate-spin" /> : null}
                    {summary.installed
                      ? t("commandCenter.market.update")
                      : t("commandCenter.market.install")}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="border-border text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
            <Store size={28} className="opacity-40" />
            <p className="text-sm">{t("commandCenter.market.empty")}</p>
            <p className="max-w-sm text-xs">{t("commandCenter.market.emptyHint")}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t("commandCenter.market.refresh")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
