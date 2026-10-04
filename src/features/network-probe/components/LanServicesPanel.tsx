/**
 * Feature UI / 功能界面: mDNS + SSDP browse (read-only).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"
import type { LanServicesResult } from "@/lib/tauri/types/network-probe"

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
          {result.truncated ? (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.lanSvc.truncated")}
            </p>
          ) : null}
          {result.failures.length > 0 ? (
            <div
              aria-live="polite"
              className="space-y-1 rounded-md border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400"
              role="status"
            >
              <p>
                {result.items.length === 0 && result.failures.length > 1
                  ? t("networkProbe.lanSvc.allFailed")
                  : t("networkProbe.lanSvc.partialFailure")}
              </p>
              {result.failures.map((failure) => {
                const protocol =
                  failure.protocol === "mdns"
                    ? t("networkProbe.lanSvc.mdns")
                    : failure.protocol === "ssdp"
                      ? t("networkProbe.lanSvc.ssdp")
                      : t("networkProbe.lanSvc.otherProtocol")

                return (
                  <div key={`${failure.protocol}-${failure.code}`}>
                    {t("networkProbe.lanSvc.protocolFailure", { protocol })}
                    <details className="mt-1">
                      <summary className="cursor-pointer">
                        {t("networkProbe.lanSvc.technicalDetails")}
                      </summary>
                      <p className="mt-1 font-mono break-words">
                        [{failure.code}] {failure.message}
                      </p>
                    </details>
                  </div>
                )
              })}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.lanSvc.meta", {
              count: result.items.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.items.length === 0 && result.failures.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("networkProbe.lanSvc.empty")}</p>
          ) : result.items.length > 0 ? (
            <VirtualizedResultList
              items={result.items}
              ariaLabel={t("networkProbe.lanSvc.results")}
              getItemKey={(item) => `${item.protocol}-${item.serviceType ?? ""}-${item.name}`}
              className="font-mono text-xs"
              renderItem={(item) => (
                <span className="break-words">
                  [{item.protocol}] {item.name}
                  {item.serviceType ? ` · ${item.serviceType}` : ""}
                  {item.host ? ` · ${item.host}` : ""}
                  {item.port ? `:${item.port}` : ""}
                  {item.txtProperties.length > 0
                    ? ` — ${t("networkProbe.lanSvc.txt", { value: item.txtProperties.join("; ") })}`
                    : ""}
                  {item.addresses.length > 0
                    ? ` · ${t("networkProbe.lanSvc.addresses", { value: item.addresses.join(", ") })}`
                    : ""}
                  {item.usn ? ` · ${t("networkProbe.lanSvc.usn", { value: item.usn })}` : ""}
                  {item.location
                    ? ` · ${t("networkProbe.lanSvc.location", { value: item.location })}`
                    : ""}
                </span>
              )}
            />
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
