/**
 * Feature UI / 功能界面: packet counter diagnostics (tcpdump degraded).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ScanCancelButton } from "@/features/network-probe/components/ScanCancelButton"
import { TechnicalDetails } from "@/features/network-probe/components/TechnicalDetails"
import type { PcapDiagResult } from "@/lib/tauri/types/network-probe"

interface PcapDiagPanelProps {
  loading: boolean
  result: PcapDiagResult | null
  toolEnabled: boolean
  toolStatus?: string
  canCancel: boolean
  cancelRequested: boolean
  onRun: () => void
  onCancel: () => void
  onManagePacks?: () => void
}

export function PcapDiagPanel({
  loading,
  result,
  toolEnabled,
  toolStatus,
  canCancel,
  cancelRequested,
  onRun,
  onCancel,
  onManagePacks,
}: PcapDiagPanelProps) {
  const { t } = useTranslation()
  const hasCounterSample = result?.mode === "tcpdump-counters"
  const statusLabel = result
    ? result.cancelled
      ? t("networkProbe.pcap.statusValue.cancelled")
      : hasCounterSample
        ? t("networkProbe.pcap.statusValue.complete")
        : result.mode === "unavailable"
          ? t("networkProbe.pcap.statusValue.unavailable")
          : t("networkProbe.pcap.statusValue.unknown")
    : null
  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.pcap.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "pcap",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.pcap.degradedHint")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <CommandHint hint={t("networkProbe.cmd.pcap")}>
              <Button type="button" disabled={loading || !toolEnabled} onClick={onRun}>
                {loading ? t("networkProbe.pcap.running") : t("networkProbe.pcap.run")}
              </Button>
            </CommandHint>
            {canCancel ? (
              <ScanCancelButton
                label={t("common.cancel")}
                cancelRequested={cancelRequested}
                onCancel={onCancel}
              />
            ) : null}
            {onManagePacks ? (
              <Button type="button" variant="outline" onClick={onManagePacks}>
                {t("networkProbe.packs.manage")}
              </Button>
            ) : null}
          </div>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.pcap.status")}: <span className="font-medium">{statusLabel}</span>
          </div>
          {hasCounterSample ? (
            <div>
              {t("networkProbe.pcap.mode")}:{" "}
              <span className="font-medium">{t("networkProbe.pcap.modeValue.counters")}</span>
            </div>
          ) : null}
          {hasCounterSample ? (
            <div className="text-muted-foreground text-xs break-words">
              {t("networkProbe.pcap.stats", {
                packets: result.packets,
                rst: result.tcpRst,
                retrans: result.retransHint,
                ooo: result.outOfOrderHint,
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">{t("networkProbe.pcap.noSample")}</p>
          )}
          <TechnicalDetails
            title={t("networkProbe.pcap.technicalDetails")}
            items={[
              { label: t("networkProbe.pcap.diagnostic"), value: result.message },
              { label: t("networkProbe.pcap.command"), value: result.commandHint },
            ]}
          />
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
