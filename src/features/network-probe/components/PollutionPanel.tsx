/**
 * Feature UI / 功能界面: pollution / hijack indicators panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PollutionReport } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface PollutionPanelProps {
  loading: boolean
  result: PollutionReport | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (domain: string) => void
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
    <div className="space-y-4">
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
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.pollution.meta", {
              domain: result.domain,
              ms: result.elapsedMs.toFixed(0),
              count: result.findings.length,
            })}
          </p>
          <ul className="max-h-80 space-y-2 overflow-auto">
            {result.findings.map((f, i) => (
              <li
                key={`${f.kind}-${i}`}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  f.severity === "high" && "border-red-500/40 bg-red-500/5",
                  f.severity === "warn" && "border-amber-500/40 bg-amber-500/5",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span>{f.kind}</span>
                  <span className="text-muted-foreground">{f.severity}</span>
                </div>
                <p className="mt-1 text-sm">{f.evidence}</p>
                <p className="text-muted-foreground mt-1 font-mono text-[11px]">{f.commandHint}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
