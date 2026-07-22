/**
 * Feature UI / 功能界面: NTP offset probe.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NtpProbeResult } from "@/lib/tauri/types/network-probe"

interface NtpPanelProps {
  loading: boolean
  result: NtpProbeResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: () => void
}

export function NtpPanel({ loading, result, toolEnabled, toolStatus, onRun }: NtpPanelProps) {
  const { t } = useTranslation()
  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.ntp.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "ntp",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <CommandHint hint={t("networkProbe.cmd.ntp")}>
            <Button type="button" disabled={loading || !toolEnabled} onClick={onRun}>
              {loading ? t("networkProbe.ntp.running") : t("networkProbe.ntp.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div className="font-mono text-xs">{result.server}</div>
          {result.offsetSeconds != null ? (
            <div>
              {t("networkProbe.ntp.offset", {
                seconds: result.offsetSeconds.toFixed(3),
                severity: result.severity,
              })}
            </div>
          ) : (
            <div>{t("networkProbe.ntp.fail")}</div>
          )}
          {result.detail ? <p className="text-muted-foreground text-xs">{result.detail}</p> : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
