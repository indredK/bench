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

const DNSSEC_DETAIL_KEYS: Record<string, string> = {
  localValidationSecure: "networkProbe.dnssec.details.localValidationSecure",
  localValidationInsecure: "networkProbe.dnssec.details.localValidationInsecure",
  localValidationBogus: "networkProbe.dnssec.details.localValidationBogus",
  localValidationIndeterminate: "networkProbe.dnssec.details.localValidationIndeterminate",
  resolverServfail: "networkProbe.dnssec.details.resolverServfail",
  resolverFailure: "networkProbe.dnssec.details.resolverFailure",
  noAnswer: "networkProbe.dnssec.details.noAnswer",
  requestTimedOut: "networkProbe.dnssec.details.requestTimedOut",
  resolverConfigurationFailed: "networkProbe.dnssec.details.resolverConfigurationFailed",
}

const DOH_DETAIL_KEYS: Record<string, string> = {
  authenticatedData: "networkProbe.dnssec.dohDetails.authenticatedData",
  notAuthenticated: "networkProbe.dnssec.dohDetails.notAuthenticated",
  missingAdSignal: "networkProbe.dnssec.dohDetails.missingAdSignal",
  resolverServfail: "networkProbe.dnssec.dohDetails.resolverServfail",
  resolverFailure: "networkProbe.dnssec.dohDetails.resolverFailure",
  httpError: "networkProbe.dnssec.dohDetails.httpError",
  requestFailed: "networkProbe.dnssec.dohDetails.requestFailed",
  invalidResponse: "networkProbe.dnssec.dohDetails.invalidResponse",
  responseTooLarge: "networkProbe.dnssec.dohDetails.responseTooLarge",
}

const DOT_DETAIL_KEYS: Record<string, string> = {
  tlsVerifiedQuerySucceeded: "networkProbe.dnssec.dotDetails.tlsVerifiedQuerySucceeded",
  tlsVerifiedDnsResponse: "networkProbe.dnssec.dotDetails.tlsVerifiedDnsResponse",
  tlsOrQueryFailed: "networkProbe.dnssec.dotDetails.tlsOrQueryFailed",
  timedOut: "networkProbe.dnssec.dotDetails.timedOut",
}

function formatLatency(value: number | undefined) {
  if (value == null) return "—"
  if (value < 1) return "<1"
  return value < 10 ? value.toFixed(1) : value.toFixed(0)
}

function localizedDetailKey(values: Record<string, string>, value: string, fallback: string) {
  return Object.hasOwn(values, value) ? values[value] : fallback
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
        {
          label: t("networkProbe.dnssec.dnssecDetail"),
          value: result.dnssecDetail
            ? t(
                localizedDetailKey(
                  DNSSEC_DETAIL_KEYS,
                  result.dnssecDetail,
                  "networkProbe.dnssec.details.unknown",
                ),
              )
            : undefined,
        },
        {
          label: t("networkProbe.dnssec.dohDetail"),
          value: result.dohDetail
            ? t(
                localizedDetailKey(
                  DOH_DETAIL_KEYS,
                  result.dohDetail,
                  "networkProbe.dnssec.dohDetails.unknown",
                ),
              )
            : undefined,
        },
        {
          label: t("networkProbe.dnssec.dotDetail"),
          value: result.dotDetail
            ? t(
                localizedDetailKey(
                  DOT_DETAIL_KEYS,
                  result.dotDetail,
                  "networkProbe.dnssec.dotDetails.unknown",
                ),
              )
            : undefined,
        },
        {
          label: t("networkProbe.dnssec.command"),
          value: result.commandHint || undefined,
        },
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
          <div className="font-medium">
            {t("networkProbe.dnssec.resultFor", { domain: result.domain })}
          </div>
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
                  ? t("networkProbe.dnssec.dohOkMs", { ms: formatLatency(result.dohRttMs) })
                  : t("networkProbe.dnssec.fail")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.dot")}</div>
              <div className="font-mono text-sm">
                {result.dotOk
                  ? t("networkProbe.dnssec.dotOkMs", { ms: formatLatency(result.dotRttMs) })
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
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
