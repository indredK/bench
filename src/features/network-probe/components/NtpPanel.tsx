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
  const severityLabel = result
    ? result.severity === "high"
      ? t("networkProbe.ntp.high")
      : result.severity === "warn"
        ? t("networkProbe.ntp.warn")
        : result.severity === "ok"
          ? t("networkProbe.ntp.ok")
          : t("networkProbe.ntp.fail")
    : null

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
          {result.offsetSeconds != null ? (
            <div>
              {t("networkProbe.ntp.offset", {
                seconds: result.offsetSeconds.toFixed(3),
                severity: severityLabel,
              })}
            </div>
          ) : (
            <div>{t("networkProbe.ntp.fail")}</div>
          )}
          {result.rttSeconds != null ? (
            <div>{t("networkProbe.ntp.rtt", { seconds: result.rttSeconds.toFixed(3) })}</div>
          ) : null}
          {result.stratum != null ? (
            <div>{t("networkProbe.ntp.stratum", { value: result.stratum })}</div>
          ) : null}
          <div>
            {t("networkProbe.ntp.sourceCount", {
              succeeded: result.sourcesSucceeded,
              configured: result.sourcesConfigured,
            })}
          </div>
          {result.detail ? (
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer">{t("networkProbe.ntp.technicalDetails")}</summary>
              <p className="mt-1 break-words">{result.detail}</p>
              <p className="mt-1 font-mono">{result.server}</p>
              <p className="mt-1 font-mono">{result.commandHint}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
