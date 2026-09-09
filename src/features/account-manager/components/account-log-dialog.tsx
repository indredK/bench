/**
 * Account log dialog / 账号日志对话框(Session Keeper).
 * 时间线展示执行情况(倒序,kind 图标 + level 色点 + detail 次要行),
 * 头部含计划摘要与下次执行时间;提供刷新按钮;≤100 条不虚拟化.
 */
import { useTranslation } from "react-i18next"
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Inbox,
  RefreshCw,
  ScrollText,
  Timer,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { InlineErrorBar } from "@/features/account-manager/components/InlineErrorBar"
import type {
  AccountLogEntry,
  AccountLogKind,
  AccountLogLevel,
} from "@/lib/tauri/types/account-manager"

const KIND_ICON: Record<AccountLogKind, typeof UserRound> = {
  login: UserRound,
  manualRefresh: RefreshCw,
  autoRefresh: Timer,
  scheduleChanged: CalendarClock,
  statusChanged: Activity,
  error: AlertTriangle,
}

const LEVEL_DOT: Record<AccountLogLevel, string> = {
  info: "bg-slate-400",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
}

function formatDetail(
  t: ReturnType<typeof useTranslation>["t"],
  entry: AccountLogEntry,
): string | null {
  const detail = entry.detail
  if (!detail) return null
  const parts: string[] = []
  if (typeof detail.status === "string") {
    parts.push(t(`accountManager.status.${detail.status}`))
  }
  if (typeof detail.errorCode === "string") {
    parts.push(t("accountManager.accountLog.errorCode", { code: detail.errorCode }))
  }
  if (typeof detail.skipReason === "string") {
    parts.push(t(`accountManager.accountLog.skipReason.${detail.skipReason}`))
  }
  if (typeof detail.durationMs === "number") {
    parts.push(t("accountManager.accountLog.duration", { ms: detail.durationMs }))
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

export function AccountLogDialog({
  open,
  onOpenChange,
  accountName,
  logs,
  loading,
  error,
  onRetry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountName: string
  logs: {
    entries: AccountLogEntry[]
    scheduleLabel: string | null
    nextRunLabel: string | null
  } | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText size={16} />
            {t("accountManager.accountLog.title", { name: accountName })}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            {logs?.scheduleLabel && (
              <p>
                {t("accountManager.accountLog.schedulePrefix")}
                {logs.scheduleLabel}
              </p>
            )}
            {logs?.nextRunLabel && <p className="text-muted-foreground">{logs.nextRunLabel}</p>}
            {!logs?.scheduleLabel && !loading && <p>{t("accountManager.accountLog.noSchedule")}</p>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onRetry}
            disabled={loading}
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            {t("accountManager.accountLog.refresh")}
          </Button>
        </div>

        {error && <InlineErrorBar message={error} onRetry={onRetry} />}

        <div className="min-h-0 flex-1">
          {loading ? (
            <div
              className="space-y-3"
              aria-busy="true"
              aria-label={t("accountManager.accountLog.loading")}
            >
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="bg-muted size-8 rounded-full motion-safe:animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="bg-muted h-3.5 w-2/5 rounded motion-safe:animate-pulse" />
                    <div className="bg-muted h-3 w-4/5 rounded motion-safe:animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : !logs || logs.entries.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Inbox size={28} />
              <p className="text-foreground text-sm font-medium">
                {t("accountManager.accountLog.empty")}
              </p>
              <p className="text-sm">{t("accountManager.accountLog.emptyHint")}</p>
            </div>
          ) : (
            <div className="max-h-[46vh] overflow-y-auto pr-2">
              <ol className="space-y-1">
                {logs.entries.map((entry) => {
                  const Icon = KIND_ICON[entry.kind] ?? ScrollText
                  const detailText = formatDetail(t, entry)
                  return (
                    <li
                      key={entry.id}
                      className="hover:bg-muted/40 flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors"
                    >
                      <span className="bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-block size-2 shrink-0 rounded-full",
                              LEVEL_DOT[entry.level],
                            )}
                            aria-hidden="true"
                          />
                          <span className="text-xs font-medium">
                            {t(`accountManager.accountLog.kind.${entry.kind}`)}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-xs" title={entry.at}>
                            {entry.at}
                          </span>
                        </div>
                        {detailText && (
                          <p
                            className="text-muted-foreground mt-0.5 truncate text-xs"
                            title={detailText}
                          >
                            {detailText}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
