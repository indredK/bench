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
  const sourceErrorLabel = (errorCode?: string) => {
    switch (errorCode) {
      case "NTP_DNS":
        return t("networkProbe.ntp.sourceErrors.dns")
      case "NTP_BIND":
        return t("networkProbe.ntp.sourceErrors.bind")
      case "NTP_TIMEOUT":
        return t("networkProbe.ntp.sourceErrors.timeout")
      case "NTP_CLOCK":
        return t("networkProbe.ntp.sourceErrors.clock")
      case "NTP_PROTOCOL":
      case "NTP_UNAVAILABLE":
        return t("networkProbe.ntp.sourceErrors.response")
      default:
        return t("networkProbe.ntp.sourceErrors.unknown")
    }
  }

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
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          {result.offsetSeconds != null ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {t("networkProbe.ntp.offset", {
                  milliseconds: `${result.offsetSeconds > 0 ? "+" : ""}${(result.offsetSeconds * 1000).toFixed(1)}`,
                })}
              </span>
              <span
                className={[
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  result.severity === "high" &&
                    "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
                  result.severity === "warn" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400",
                  result.severity === "ok" &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-400",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {t(
                  `networkProbe.ntp.severity.${result.severity === "warn" || result.severity === "high" ? result.severity : "ok"}`,
                )}
              </span>
            </div>
          ) : (
            <p className="text-destructive">{t("networkProbe.ntp.fail")}</p>
          )}
          {result.rttSeconds != null ? (
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.ntp.rtt", { milliseconds: (result.rttSeconds * 1000).toFixed(1) })}
            </p>
          ) : null}
          {result.sources.length > 0 ? (
            <ul aria-label={t("networkProbe.ntp.sources")} className="space-y-1">
              {result.sources.map((source) => (
                <li
                  key={source.server}
                  className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-1"
                >
                  <span className="font-mono text-xs break-all">{source.server}</span>
                  <span className="text-muted-foreground text-xs">
                    {source.ok &&
                    source.offsetSeconds != null &&
                    source.rttSeconds != null &&
                    source.stratum != null
                      ? t("networkProbe.ntp.sourceMetrics", {
                          offset: `${source.offsetSeconds > 0 ? "+" : ""}${(source.offsetSeconds * 1000).toFixed(1)}`,
                          rtt: (source.rttSeconds * 1000).toFixed(1),
                          stratum: source.stratum,
                        })
                      : sourceErrorLabel(source.errorCode)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {result.detail ? (
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer">{t("networkProbe.ntp.technicalDetails")}</summary>
              <p className="mt-1 break-words">{result.detail}</p>
            </details>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
