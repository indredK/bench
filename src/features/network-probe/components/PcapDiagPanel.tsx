/**
 * Feature UI / 功能界面: packet counter diagnostics (tcpdump degraded).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { PcapDiagResult } from "@/lib/tauri/types/network-probe"

interface PcapDiagPanelProps {
  loading: boolean
  result: PcapDiagResult | null
  toolEnabled: boolean
  toolStatus?: string
  canCancel: boolean
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
  onRun,
  onCancel,
  onManagePacks,
}: PcapDiagPanelProps) {
  const { t } = useTranslation()
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
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t("common.cancel")}
                </Button>
              </CommandHint>
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
            {t("networkProbe.pcap.mode")}:{" "}
            <span className="font-mono font-medium">{result.mode}</span>
          </div>
          <div className="font-mono text-xs">
            {t("networkProbe.pcap.stats", {
              packets: result.packets,
              rst: result.tcpRst,
              retrans: result.retransHint,
              ooo: result.outOfOrderHint,
            })}
          </div>
          {result.message ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
