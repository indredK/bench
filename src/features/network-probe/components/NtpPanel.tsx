/**
 * Feature UI / 功能界面: NTP offset probe.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NtpProbeResult } from "@/lib/tauri/types/network-probe"

function ntpSeverityKey(severity: string) {
  switch (severity) {
    case "ok":
      return "networkProbe.ntp.severity.ok"
    case "info":
      return "networkProbe.ntp.severity.info"
    case "warn":
      return "networkProbe.ntp.severity.warn"
    default:
      return "networkProbe.ntp.severity.unknown"
  }
}

function ntpErrorKey(errorCode?: string) {
  switch (errorCode) {
    case "NTP_BIND":
      return "networkProbe.ntp.errors.bind"
    case "NTP_DNS":
      return "networkProbe.ntp.errors.dns"
    case "NTP_NETWORK":
      return "networkProbe.ntp.errors.network"
    case "NTP_TIMEOUT":
      return "networkProbe.ntp.errors.timeout"
    case "NTP_SOURCE":
      return "networkProbe.ntp.errors.source"
    case "NTP_KISS_OF_DEATH":
      return "networkProbe.ntp.errors.serverRefused"
    case "NTP_RESPONSE":
      return "networkProbe.ntp.errors.response"
    default:
      return "networkProbe.ntp.errors.unknown"
  }
}

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
          {result.offsetSeconds != null ? (
            <div>
              {t("networkProbe.ntp.offset", {
                seconds: result.offsetSeconds.toFixed(3),
                severity: t(ntpSeverityKey(result.severity)),
              })}
            </div>
          ) : (
            <div role="status">{t("networkProbe.ntp.fail")}</div>
          )}
          <ul
            aria-label={t("networkProbe.ntp.sourceResults")}
            className="text-muted-foreground space-y-1 text-xs"
          >
            {result.sources.map((source) => (
              <li key={source.server}>
                {source.ok && source.offsetSeconds != null
                  ? t("networkProbe.ntp.sourceOffset", {
                      server: source.server,
                      seconds: source.offsetSeconds.toFixed(3),
                    })
                  : t("networkProbe.ntp.sourceFailed", {
                      server: source.server,
                      reason: t(ntpErrorKey(source.errorCode)),
                    })}
              </li>
            ))}
          </ul>
          {result.detail || result.commandHint ? (
            <details className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
              <summary className="w-fit cursor-pointer select-none">
                {t("networkProbe.ntp.technicalDetails")}
              </summary>
              <div className="mt-2 space-y-2">
                {result.detail ? (
                  <pre className="font-mono break-all whitespace-pre-wrap">{result.detail}</pre>
                ) : null}
                {result.commandHint ? (
                  <pre className="font-mono break-all whitespace-pre-wrap">
                    {result.commandHint}
                  </pre>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
