/**
 * Feature UI / 功能界面: DNSSEC / DoH / DoT panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DnsSecCheckResult } from "@/lib/tauri/types/network-probe"

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

  return (
    <div className="space-y-4">
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
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.dnssec.status")}:{" "}
            <span className="font-mono font-medium">{result.dnssecStatus}</span>
          </div>
          {result.dnssecDetail ? <p className="text-sm">{result.dnssecDetail}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.doh")}</div>
              <div className="font-mono text-sm">
                {result.dohOk
                  ? t("networkProbe.dnssec.okMs", { ms: result.dohRttMs?.toFixed(0) ?? "—" })
                  : t("networkProbe.dnssec.fail")}
              </div>
              {result.dohDetail ? (
                <p className="text-muted-foreground text-xs">{result.dohDetail}</p>
              ) : null}
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("networkProbe.dnssec.dot")}</div>
              <div className="font-mono text-sm">
                {result.dotOk
                  ? t("networkProbe.dnssec.okMs", { ms: result.dotRttMs?.toFixed(0) ?? "—" })
                  : t("networkProbe.dnssec.fail")}
              </div>
              {result.dotDetail ? (
                <p className="text-muted-foreground text-xs">{result.dotDetail}</p>
              ) : null}
            </div>
          </div>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </div>
  )
}
