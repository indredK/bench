/**
 * Feature UI / 功能界面: WHOIS / RDAP panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WhoisInfo } from "@/lib/tauri/types/network-probe"

interface WhoisPanelProps {
  loading: boolean
  result: WhoisInfo | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (query: string) => void
}

export function WhoisPanel({ loading, result, toolEnabled, toolStatus, onRun }: WhoisPanelProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("example.com")

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("networkProbe.whois.hint")}</p>
      {!toolEnabled ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.caps.toolDisabled", {
            tool: "whois",
            status: toolStatus ?? "unsupported",
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <label className="text-xs font-medium" htmlFor="np-whois-query">
            {t("networkProbe.whois.query")}
          </label>
          <Input
            id="np-whois-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
        </div>
        <CommandHint hint={t("networkProbe.cmd.whois", { query: query.trim() || "…" })}>
          <Button
            type="button"
            disabled={loading || !toolEnabled || !query.trim()}
            onClick={() => onRun(query.trim())}
          >
            {loading ? t("networkProbe.whois.running") : t("networkProbe.whois.run")}
          </Button>
        </CommandHint>
      </div>
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {result.source}
            {result.partial ? (
              <span className="text-muted-foreground ml-2 text-xs">
                ({t("networkProbe.whois.partial")})
              </span>
            ) : null}
          </div>
          {result.message ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
          ) : null}
          <pre className="text-muted-foreground max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {result.rawText || t("networkProbe.whois.empty")}
          </pre>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </div>
  )
}
