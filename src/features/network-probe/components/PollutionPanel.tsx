/**
 * Feature UI / 功能界面: pollution / hijack indicators panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { PollutionReport } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface PollutionPanelProps {
  loading: boolean
  result: PollutionReport | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (domain: string) => void
}

const KIND_LABELS: Record<string, string> = {
  arp: "networkProbe.pollution.kind.arp",
  dns: "networkProbe.pollution.kind.dns",
  hosts: "networkProbe.pollution.kind.hosts",
  route: "networkProbe.pollution.kind.route",
  tls: "networkProbe.pollution.kind.tls",
}

const SEVERITIES: Record<string, { label: string; summary: string }> = {
  info: {
    label: "networkProbe.pollution.severity.info",
    summary: "networkProbe.pollution.summary.info",
  },
  warn: {
    label: "networkProbe.pollution.severity.warn",
    summary: "networkProbe.pollution.summary.warn",
  },
  high: {
    label: "networkProbe.pollution.severity.high",
    summary: "networkProbe.pollution.summary.high",
  },
}

export function PollutionPanel({
  loading,
  result,
  toolEnabled,
  toolStatus,
  onRun,
}: PollutionPanelProps) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState("example.com")

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.pollution.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "pollution",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-pollution-domain">
                {t("networkProbe.pollution.domain")}
              </label>
              <Input
                id="np-pollution-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <CommandHint hint={t("networkProbe.cmd.pollution", { domain: domain.trim() || "…" })}>
              <Button
                type="button"
                disabled={loading || !toolEnabled || !domain.trim()}
                onClick={() => onRun(domain.trim())}
              >
                {loading ? t("networkProbe.pollution.running") : t("networkProbe.pollution.run")}
              </Button>
            </CommandHint>
          </div>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.pollution.meta", {
              domain: result.domain,
              ms: result.elapsedMs.toFixed(0),
              count: result.findings.length,
            })}
          </p>
          <ul className="space-y-2">
            {result.findings.map((f, i) => {
              const severity = SEVERITIES[f.severity]
              const summaryKey =
                f.kind === "tls" && f.severity === "warn"
                  ? "networkProbe.pollution.summary.tlsWarning"
                  : (severity?.summary ?? "networkProbe.pollution.summary.unknown")

              return (
                <li
                  key={`${f.kind}-${i}`}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    f.severity === "high" && "border-red-500/40 bg-red-500/5",
                    f.severity === "warn" && "border-amber-500/40 bg-amber-500/5",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <span>{t(KIND_LABELS[f.kind] ?? "networkProbe.pollution.kind.unknown")}</span>
                    <span className="text-muted-foreground">
                      {t(severity?.label ?? "networkProbe.pollution.severity.unknown")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{t(summaryKey)}</p>
                  <details className="text-muted-foreground mt-2 text-xs">
                    <summary className="cursor-pointer select-none">
                      {t("networkProbe.pollution.technicalDetails")}
                    </summary>
                    <dl className="mt-2 space-y-1 break-words">
                      <div>
                        <dt className="font-medium">{t("networkProbe.pollution.evidence")}</dt>
                        <dd>{f.evidence}</dd>
                      </div>
                      <div>
                        <dt className="font-medium">{t("networkProbe.pollution.command")}</dt>
                        <dd className="font-mono text-[11px] break-all">{f.commandHint}</dd>
                      </div>
                    </dl>
                  </details>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
