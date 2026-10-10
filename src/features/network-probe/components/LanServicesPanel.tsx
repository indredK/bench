/**
 * Feature UI / 功能界面: mDNS + SSDP browse (read-only).
 */
import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { TechnicalDetails } from "@/features/network-probe/components/TechnicalDetails"
import type {
  LanServiceItem,
  LanServiceProtocol,
  LanServicesResult,
} from "@/lib/tauri/types/network-probe"

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
  const items = result?.items ?? []
  const listRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    getItemKey: (index) => {
      const item = items[index]
      return item ? getItemKey(item, index) : index
    },
    estimateSize: () => 72,
    overscan: 6,
    initialRect: { width: 640, height: 288 },
  })
  const protocolLabel = (protocol: LanServiceProtocol) =>
    protocol === "mdns"
      ? t("networkProbe.lanSvc.protocolMdns")
      : t("networkProbe.lanSvc.protocolSsdp")

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
          {result.issues.length > 0 ? (
            <>
              {result.issues.map((issue) => (
                <p
                  key={`${issue.protocol}-${issue.code}`}
                  role="alert"
                  className="text-xs text-amber-700 dark:text-amber-400"
                >
                  {t("networkProbe.lanSvc.protocolFailed", {
                    protocol: protocolLabel(issue.protocol),
                  })}
                </p>
              ))}
              <TechnicalDetails
                title={t("networkProbe.lanSvc.technicalDetails")}
                items={result.issues.map((issue) => ({
                  label: `${protocolLabel(issue.protocol)} ${t("networkProbe.lanSvc.issueCode")}`,
                  value: issue.code,
                }))}
              />
            </>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.lanSvc.meta", {
              count: result.items.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t(
                result.issues.length === 0
                  ? "networkProbe.lanSvc.empty"
                  : "networkProbe.lanSvc.emptyPartial",
              )}
            </p>
          ) : (
            <div
              ref={listRef}
              className="max-h-72 overflow-auto"
              data-lan-services-scroll
              style={{ height: `${virtualizer.getTotalSize()}px`, maxHeight: "18rem" }}
            >
              <ul
                className="relative font-mono text-xs"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const it = items[virtualItem.index]
                  if (!it) return null
                  return (
                    <li
                      key={getItemKey(it, virtualItem.index)}
                      ref={virtualizer.measureElement}
                      data-index={virtualItem.index}
                      className="absolute top-0 left-0 w-full pb-2 break-words"
                      style={{ transform: `translateY(${virtualItem.start}px)` }}
                    >
                      <span className="font-semibold">[{protocolLabel(it.protocol)}]</span>{" "}
                      {it.name || t("networkProbe.lanSvc.unknownDevice")}
                      {it.serviceType ? ` · ${it.serviceType}` : ""}
                      {it.host ? ` · ${it.host}` : ""}
                      {it.port != null ? `:${it.port}` : ""}
                      {it.uuid ? ` · ${t("networkProbe.lanSvc.deviceId")}: ${it.uuid}` : ""}
                      {it.txtProperties?.length ? (
                        <div className="text-muted-foreground">
                          {t("networkProbe.lanSvc.txtProperties")}: {it.txtProperties.join(" · ")}
                        </div>
                      ) : null}
                      {it.protocol === "ssdp" ? (
                        <div className="text-muted-foreground">
                          {t("networkProbe.lanSvc.location")}:{" "}
                          {it.location ?? t("networkProbe.lanSvc.locationUnavailable")}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

function getItemKey(item: LanServiceItem, index: number) {
  return `${item.protocol}-${item.serviceType ?? ""}-${item.uuid ?? item.name}-${index}`
}
