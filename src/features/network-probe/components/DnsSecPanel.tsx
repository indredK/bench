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

interface DnsSecPanelProps {
  loading: boolean
  result: DnsSecCheckResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (domain: string) => void
}

function dnssecStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "secure":
      return t("networkProbe.dnssec.statusSecure")
    case "insecure":
      return t("networkProbe.dnssec.statusInsecure")
    case "bogus":
      return t("networkProbe.dnssec.statusBogus")
    default:
      return t("networkProbe.dnssec.statusUnknown")
  }
}

export function DnsSecPanel({ loading, result, toolEnabled, toolStatus, onRun }: DnsSecPanelProps) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState("cloudflare.com")

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
            <span className="font-medium">{dnssecStatusLabel(result.dnssecStatus, t)}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.doh")}</div>
              <div className="font-mono text-sm">
                {result.dohOk
                  ? t("networkProbe.dnssec.okMs", { ms: result.dohRttMs?.toFixed(0) ?? "—" })
                  : t("networkProbe.dnssec.fail")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.dot")}</div>
              <div className="font-mono text-sm">
                {result.dotOk
                  ? t("networkProbe.dnssec.okMs", { ms: result.dotRttMs?.toFixed(0) ?? "—" })
                  : t("networkProbe.dnssec.fail")}
              </div>
            </div>
          </div>
          <details className="text-muted-foreground text-xs">
            <summary className="cursor-pointer select-none">
              {t("networkProbe.dnssec.technicalDetails")}
            </summary>
            <div className="mt-2 space-y-1 break-words">
              {result.dnssecDetail ? <p>{result.dnssecDetail}</p> : null}
              {result.dohDetail ? <p>{result.dohDetail}</p> : null}
              {result.dotDetail ? <p>{result.dotDetail}</p> : null}
              <p className="font-mono">{result.commandHint}</p>
            </div>
          </details>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
