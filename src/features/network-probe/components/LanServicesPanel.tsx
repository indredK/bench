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
          {result.message ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
          ) : null}
          {result.errors?.map((error, index) => {
            const protocol =
              error.protocol === "mdns"
                ? t("networkProbe.lanSvc.protocols.mdns")
                : error.protocol === "ssdp"
                  ? t("networkProbe.lanSvc.protocols.ssdp")
                  : error.protocol

            return (
              <div
                key={`${error.protocol}:${error.code}:${index}`}
                role="alert"
                className="border-destructive/40 bg-destructive/5 text-destructive space-y-1 rounded-md border px-3 py-2 text-sm"
              >
                <p>{t("networkProbe.lanSvc.protocolFailure", { protocol })}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer">
                    {t("networkProbe.lanSvc.technicalDetails")}
                  </summary>
                  <code className="mt-1 block break-all">
                    {error.code}: {error.message}
                  </code>
                </details>
              </div>
            )
          })}
          {result.truncated ? (
            <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
              {t("networkProbe.lanSvc.truncated", { limit: 512 })}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.lanSvc.meta", {
              count: result.items.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.items.length === 0 && (result.errors?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t("networkProbe.lanSvc.empty")}</p>
          ) : result.items.length > 0 ? (
            <VirtualizedResultList
              items={result.items}
              getKey={(item, index) => `${item.protocol}-${item.name}-${index}`}
              ariaLabel={t("networkProbe.lanSvc.listLabel")}
              className="space-y-1 font-mono text-xs"
              itemClassName="break-all border-b border-border/50 py-1"
              estimatedItemHeight={44}
              renderItem={(it) => (
                <>
                  [{it.protocol}] {it.name}
                  {it.serviceType ? ` · ${it.serviceType}` : ""}
                  {it.host ? ` · ${it.host}` : ""}
                  {it.port ? `:${it.port}` : ""}
                  {it.detail ? ` — ${it.detail}` : ""}
                </>
              )}
            />
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
