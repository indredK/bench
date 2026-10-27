/**
 * Feature UI / 功能界面: STUN-observed NAT mapping.
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

const NAT_TYPE_ALIASES: Record<string, string> = {
  "cone-or-mapped": "mapped-address",
  "symmetric-or-varied": "varying-mapping",
}

export function NatPanel({ loading, result, toolEnabled, toolStatus, onRun }: NatPanelProps) {
  const { t } = useTranslation()
  const natType = result ? (NAT_TYPE_ALIASES[result.natType] ?? result.natType) : "unknown"
  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.nat.hint")}</p>
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
              {t(`networkProbe.nat.types.${natType}`, {
                defaultValue: t("networkProbe.nat.types.unknown"),
              })}
            </span>
          </div>
          {result.mappedAddress ? (
            <div>
              {t("networkProbe.nat.mapped")}:{" "}
              <span className="font-mono">{result.mappedAddress}</span>
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t(`networkProbe.nat.explanations.${natType}`, {
              defaultValue: t("networkProbe.nat.explanations.unknown"),
            })}
          </p>
          {result.serverResults?.length ? (
            <ul className="space-y-1 text-xs" aria-label={t("networkProbe.nat.serverResults")}>
              {result.serverResults.map((server) => (
                <li key={server.server} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-mono">{server.server}</span>
                  <span className="text-muted-foreground">
                    {t(`networkProbe.nat.serverStatuses.${server.status}`, {
                      defaultValue: t("networkProbe.nat.serverStatuses.unknown"),
                    })}
                    {server.mappedAddress ? ` · ${server.mappedAddress}` : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
            <span>
              {t("networkProbe.nat.elapsed", { seconds: (result.elapsedMs / 1000).toFixed(1) })}
            </span>
            <span className="font-mono">{result.commandHint}</span>
          </div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
