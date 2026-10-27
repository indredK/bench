/**
 * Feature UI / 功能界面: NAT type via STUN.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type {
  NatBehaviorStatus,
  NatProbeResult,
  NatProbeStatus,
} from "@/lib/tauri/types/network-probe"

const NAT_STATUS_KEYS: Record<NatProbeStatus, { label: string; explanation: string }> = {
  "blocked-or-timeout": {
    label: "networkProbe.nat.status.blocked",
    explanation: "networkProbe.nat.explanation.blocked",
  },
  "insufficient-evidence": {
    label: "networkProbe.nat.status.insufficient",
    explanation: "networkProbe.nat.explanation.insufficient",
  },
  "consistent-mapping": {
    label: "networkProbe.nat.status.consistent",
    explanation: "networkProbe.nat.explanation.consistent",
  },
  "mapping-varies": {
    label: "networkProbe.nat.status.varies",
    explanation: "networkProbe.nat.explanation.varies",
  },
}

const NAT_BEHAVIOR_KEYS: Record<NatBehaviorStatus, string> = {
  "no-nat": "networkProbe.nat.behavior.noNat",
  "endpoint-independent": "networkProbe.nat.behavior.endpointIndependent",
  "address-dependent": "networkProbe.nat.behavior.addressDependent",
  "address-and-port-dependent": "networkProbe.nat.behavior.addressAndPortDependent",
  unsupported: "networkProbe.nat.behavior.unsupported",
  inconclusive: "networkProbe.nat.behavior.inconclusive",
}

interface NatPanelProps {
  loading: boolean
  result: NatProbeResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: () => void
}

export function NatPanel({ loading, result, toolEnabled, toolStatus, onRun }: NatPanelProps) {
  const { t } = useTranslation()
  const status = result ? NAT_STATUS_KEYS[result.natType] : undefined
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
              {t(status?.label ?? "networkProbe.nat.status.unknown")}
            </span>
          </div>
          <div>
            {t("networkProbe.nat.mappingBehavior")}:{" "}
            <span className="font-medium">
              {t(
                NAT_BEHAVIOR_KEYS[result.mappingBehavior] ??
                  "networkProbe.nat.behavior.inconclusive",
              )}
            </span>
          </div>
          <div>
            {t("networkProbe.nat.filteringBehavior")}:{" "}
            <span className="font-medium">
              {t(
                NAT_BEHAVIOR_KEYS[result.filteringBehavior] ??
                  "networkProbe.nat.behavior.inconclusive",
              )}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">{t("networkProbe.nat.behaviorHint")}</p>
          {result.mappedAddress ? (
            <div>
              {t("networkProbe.nat.mapped")}:{" "}
              <span className="font-mono">{result.mappedAddress}</span>
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t(status?.explanation ?? "networkProbe.nat.explanation.unknown")}
          </p>
          {result.detail || result.commandHint ? (
            <details className="text-muted-foreground text-xs">
              <summary className="focus-visible:ring-ring w-fit cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:outline-none">
                {t("networkProbe.nat.technicalDetails")}
              </summary>
              {result.detail ? (
                <p className="pt-1 break-words whitespace-pre-wrap">{result.detail}</p>
              ) : null}
              <p className="pt-1 font-mono break-words">{result.commandHint}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </ProbePanelShell>
  )
}
