/**
 * Feature UI / 功能界面: DNSSEC / DoH / DoT panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { DnsSecCheckResult } from "@/lib/tauri/types/network-probe"

const DNSSEC_STATUSES = new Set(["secure", "insecure", "bogus", "unknown", "unsupported"])

function formatLatency(value: number | undefined) {
  if (value == null) return "—"
  if (value < 1) return "<1"
  return value < 10 ? value.toFixed(1) : value.toFixed(0)
}

interface DnsSecPanelProps {
  loading: boolean
  result: DnsSecCheckResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (domain: string) => void
}

export function DnsSecPanel({ loading, result, toolEnabled, toolStatus, onRun }: DnsSecPanelProps) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState("cloudflare.com")
  const technicalDetails = result
    ? [
        { label: t("networkProbe.dnssec.dnssecDetail"), value: result.dnssecDetail },
        { label: t("networkProbe.dnssec.dohDetail"), value: result.dohDetail },
        { label: t("networkProbe.dnssec.dotDetail"), value: result.dotDetail },
      ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value))
    : []

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.dnssec.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "dnssec",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-dnssec-domain">
                {t("networkProbe.dnssec.domain")}
              </label>
              <Input
                id="np-dnssec-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <CommandHint hint={t("networkProbe.cmd.dnssec", { domain: domain.trim() || "…" })}>
              <Button
                type="button"
                disabled={loading || !toolEnabled || !domain.trim()}
                onClick={() => onRun(domain.trim())}
              >
                {loading ? t("networkProbe.dnssec.running") : t("networkProbe.dnssec.run")}
              </Button>
            </CommandHint>
          </div>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.dnssec.status")}:{" "}
            <span className="font-medium">
              {t(
                `networkProbe.dnssec.statusValue.${DNSSEC_STATUSES.has(result.dnssecStatus) ? result.dnssecStatus : "unknown"}`,
              )}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.doh")}</div>
              <div className="font-mono text-sm">
                {result.dohOk
                  ? t("networkProbe.dnssec.okMs", { ms: formatLatency(result.dohRttMs) })
                  : t("networkProbe.dnssec.fail")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.dot")}</div>
              <div className="font-mono text-sm">
                {result.dotOk
                  ? t("networkProbe.dnssec.okMs", { ms: formatLatency(result.dotRttMs) })
                  : t("networkProbe.dnssec.fail")}
              </div>
            </div>
          </div>
          {technicalDetails.length > 0 ? (
            <details className="text-muted-foreground text-xs">
              <summary className="w-fit cursor-pointer">
                {t("networkProbe.dnssec.technicalDetails")}
              </summary>
              <ul className="mt-1 space-y-1 break-words">
                {technicalDetails.map((detail) => (
                  <li key={detail.label}>
                    <span className="font-medium">{detail.label}:</span> {detail.value}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
