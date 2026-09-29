/**
 * Feature UI / 功能界面: STUN mapped-address comparison.
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

export function NatPanel({ loading, result, toolEnabled, toolStatus, onRun }: NatPanelProps) {
  const { t } = useTranslation()
  const resultLabel = result
    ? result.natType === "mapping-consistent"
      ? t("networkProbe.nat.mappingConsistent")
      : result.natType === "mapping-varies"
        ? t("networkProbe.nat.mappingVaries")
        : result.natType === "mapping-insufficient"
          ? t("networkProbe.nat.mappingInsufficient")
          : t("networkProbe.nat.unavailable")
    : null

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
            {t("networkProbe.nat.result")}: <span className="font-medium">{resultLabel}</span>
          </div>
          {result.mappedAddress ? (
            <div>
              {t("networkProbe.nat.mapped")}:{" "}
              <span className="font-mono">{result.mappedAddress}</span>
            </div>
          ) : null}
          {result.detail ? (
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer">{t("networkProbe.nat.technicalDetails")}</summary>
              <p className="mt-1 break-words">{result.detail}</p>
              <p className="mt-1 font-mono">{result.stunServer}</p>
              <p className="mt-1 font-mono">{result.commandHint}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
