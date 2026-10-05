/**
 * Feature UI / 功能界面: STUN mapping observation.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NatProbeResult } from "@/lib/tauri/types/network-probe"

interface NatPanelProps {
  loading: boolean
  result: NatProbeResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: () => void
}

const resultLabels: Record<string, string> = {
  "consistent-across-servers": "networkProbe.nat.consistent",
  "varied-across-servers": "networkProbe.nat.varied",
  "blocked-or-timeout": "networkProbe.nat.blockedOrTimeout",
}

export function NatPanel({ loading, result, toolEnabled, toolStatus, onRun }: NatPanelProps) {
  const { t } = useTranslation()
  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.nat.hint")}</p>
          <p className="text-muted-foreground text-xs">{t("networkProbe.nat.scopeNote")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "nat",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <CommandHint hint={t("networkProbe.cmd.nat")}>
            <Button type="button" disabled={loading || !toolEnabled} onClick={onRun}>
              {loading ? t("networkProbe.nat.running") : t("networkProbe.nat.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.nat.type")}:{" "}
            <span className="font-medium">
              {resultLabels[result.natType] ? t(resultLabels[result.natType]) : result.natType}
            </span>
          </div>
          {result.mappedAddress ? (
            <div>
              {t("networkProbe.nat.mapped")}:{" "}
              <span className="font-mono">{result.mappedAddress}</span>
            </div>
          ) : null}
          {result.detail ? (
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer">{t("networkProbe.nat.details")}</summary>
              <p className="mt-1">{result.detail}</p>
            </details>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
