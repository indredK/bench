/**
 * Account log dialog / 账号日志对话框(Session Keeper).
 * 时间线展示执行情况(倒序,kind 图标 + level 色点 + detail 次要行),
 * 头部含计划摘要与下次执行时间;提供刷新按钮;≤100 条不虚拟化.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Globe,
  History,
  Inbox,
  RefreshCw,
  ScrollText,
  Settings2,
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
  browserInterop: Globe,
  lifecycle: History,
  config: Settings2,
  error: AlertTriangle,
}

const LEVEL_DOT: Record<AccountLogLevel, string> = {
  info: "bg-slate-400",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
}

const ALL_KINDS: AccountLogKind[] = [
  "login",
  "manualRefresh",
  "autoRefresh",
  "scheduleChanged",
  "statusChanged",
  "browserInterop",
  "lifecycle",
  "config",
  "error",
]

/** detail 中可直接本地化的枚举字段(值存在且有翻译时追加为次要行)。 */
const DETAIL_TRANSLATED_KEYS: Array<{ key: string; i18nPrefix: string }> = [
  { key: "source", i18nPrefix: "accountManager.accountLog.detail.source" },
  { key: "layer", i18nPrefix: "accountManager.accountLog.detail.layer" },
  { key: "captureStatus", i18nPrefix: "accountManager.accountLog.detail.captureStatus" },
  { key: "forwardResult", i18nPrefix: "accountManager.accountLog.detail.forwardResult" },
  { key: "reason", i18nPrefix: "accountManager.accountLog.detail.reason" },
]

function formatDetail(t: ReturnType<typeof useTranslation>["t"], entry: AccountLogEntry): string[] {
  const detail = entry.detail
  if (!detail) return []
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
  for (const { key, i18nPrefix } of DETAIL_TRANSLATED_KEYS) {
    const value = detail[key]
    if (typeof value === "string") {
      const label = t(`${i18nPrefix}.${value}`)
      // i18n 未命中时 (key === label) 说明没有对应翻译,跳过该枚举。
      if (label !== `${i18nPrefix}.${value}`) {
        parts.push(label)
      }
    }
  }
  return parts
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
  /** F3 — 事件类型过滤:null = 全部。 */
  const [kindFilter, setKindFilter] = useState<AccountLogKind | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredEntries = useMemo(() => {
    if (!logs) return []
    if (kindFilter === null) return logs.entries
    return logs.entries.filter((entry) => entry.kind === kindFilter)
  }, [logs, kindFilter])

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

        {/* F3 — 事件类型过滤 chips */}
        {!loading && logs && logs.entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant={kindFilter === null ? "default" : "outline"}
              size="xs"
              onClick={() => setKindFilter(null)}
            >
              {t("accountManager.accountLog.filterAll")}
            </Button>
            {ALL_KINDS.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant={kindFilter === kind ? "default" : "outline"}
                size="xs"
                onClick={() => setKindFilter(kindFilter === kind ? null : kind)}
              >
                {t(`accountManager.accountLog.kind.${kind}`)}
              </Button>
            ))}
          </div>
        )}

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
          ) : !logs || filteredEntries.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
              <Inbox size={28} />
              <p className="text-foreground text-sm font-medium">
                {kindFilter === null
                  ? t("accountManager.accountLog.empty")
                  : t("accountManager.accountLog.emptyFiltered")}
              </p>
              <p className="text-sm">{t("accountManager.accountLog.emptyHint")}</p>
            </div>
          ) : (
            <div className="max-h-[46vh] overflow-y-auto pr-2">
              <ol className="space-y-1">
                {filteredEntries.map((entry) => {
                  const Icon = KIND_ICON[entry.kind] ?? ScrollText
                  const detailParts = formatDetail(t, entry)
                  const expanded = expandedId === entry.id
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
                          <button
                            type="button"
                            className="min-w-0 text-left text-xs font-medium hover:underline"
                            onClick={() => setExpandedId(expanded ? null : entry.id)}
                          >
                            {t(`accountManager.accountLog.kind.${entry.kind}`)}
                          </button>
                          <span className="text-muted-foreground shrink-0 text-xs" title={entry.at}>
                            {entry.at}
                          </span>
                        </div>
                        {detailParts.length > 0 && (
                          <p
                            className={cn(
                              "text-muted-foreground mt-0.5 text-xs",
                              expanded ? "break-words whitespace-normal" : "truncate",
                            )}
                            title={expanded ? undefined : detailParts.join(" · ")}
                          >
                            {detailParts.join(" · ")}
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
