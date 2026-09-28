/**
 * Feature UI / 功能界面: mDNS + SSDP browse (read-only).
 */
import { useTranslation } from "react-i18next"
import { useCallback } from "react"
import type { TFunction } from "i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { VirtualList } from "@/components/content/VirtualList"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { LanServiceItem, LanServicesResult } from "@/lib/tauri/types/network-probe"

const MAX_SERVICE_RESULTS = 512

function formatService(item: LanServiceItem, t: TFunction): string {
  if (!item.serviceType && item.protocol === "mdns") {
    if (item.detail === "[RESULT_LIMIT]") {
      return t("networkProbe.lanSvc.resultLimit", { limit: MAX_SERVICE_RESULTS })
    }
    return t("networkProbe.lanSvc.mdnsError")
  }
  if (!item.serviceType && item.protocol === "ssdp") {
    if (item.detail === "[RESULT_LIMIT]") {
      return t("networkProbe.lanSvc.resultLimit", { limit: MAX_SERVICE_RESULTS })
    }
    const code = item.detail.match(/^\[([A-Z0-9_]+)\]/)?.[1]
    if (code === "SSDP_SEND") return t("networkProbe.lanSvc.ssdpSendError")
    return t("networkProbe.lanSvc.ssdpError")
  }
  return `[${item.protocol}] ${item.name}${item.serviceType ? ` · ${item.serviceType}` : ""}${item.host ? ` · ${item.host}` : ""}${item.port != null ? `:${item.port}` : ""}${item.detail ? ` — ${item.detail}` : ""}`
}

interface LanServicesPanelProps {
  loading: boolean
  result: LanServicesResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: () => void
}

export function LanServicesPanel({
  loading,
  result,
  toolEnabled,
  toolStatus,
  onRun,
}: LanServicesPanelProps) {
  const { t } = useTranslation()
  const formatItem = useCallback((item: LanServiceItem) => formatService(item, t), [t])
  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.lanSvc.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "lanServices",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.lanSvc.readOnlyHint")}
            </p>
          )}
          <CommandHint hint={t("networkProbe.cmd.lanSvc")}>
            <Button type="button" disabled={loading || !toolEnabled} onClick={onRun}>
              {loading ? t("networkProbe.lanSvc.running") : t("networkProbe.lanSvc.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.lanSvc.meta", {
              count: result.items.filter((item) => Boolean(item.serviceType)).length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("networkProbe.lanSvc.empty")}</p>
          ) : (
            <VirtualList
              items={result.items}
              getItemKey={(item, index) => `${item.protocol}-${item.name}-${index}`}
              getItemLabel={formatItem}
              renderItem={formatItem}
              className="font-mono text-xs"
            />
          )}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
