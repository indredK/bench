/**
 * Feature UI / 功能界面: public egress IP (dual entry with Offline).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbeEmptyState } from "@/features/network-probe/components/ProbeEmptyState"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { PublicIpInfo } from "@/lib/tauri/types/network-probe"

interface EgressPanelProps {
  loading: boolean
  result: PublicIpInfo | null
  hasError?: boolean
  onRun: () => void
  dualFrom?: "offline" | "test"
}

export function EgressPanel({
  loading,
  result,
  hasError = false,
  onRun,
  dualFrom,
}: EgressPanelProps) {
  const { t } = useTranslation()

  return (
    <ProbePanelShell
      embedded={dualFrom === "offline"}
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.egress.hint")}</p>
          {dualFrom ? (
            <p className="text-muted-foreground text-xs">
              {t(`networkProbe.dualEntry.from.${dualFrom}`)}
            </p>
          ) : null}
          <CommandHint hint={t("networkProbe.cmd.egress")}>
            <Button type="button" disabled={loading} onClick={onRun}>
              {loading ? t("networkProbe.egress.running") : t("networkProbe.egress.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.offline.ip")}:{" "}
            <span className="font-mono font-medium">{result.ip ?? "—"}</span>
            {result.source ? (
              <span className="text-muted-foreground"> · {result.source}</span>
            ) : null}
          </div>
          {result.asn ? (
            <div className="text-muted-foreground text-xs">
              {t("networkProbe.egress.asn", {
                asn: result.asn,
                org: result.org ? ` · ${result.org}` : "",
              })}
            </div>
          ) : null}
          {result.detail ? <p className="text-muted-foreground text-xs">{result.detail}</p> : null}
          <p className="text-muted-foreground font-mono text-[10px]">{result.commandHint}</p>
        </div>
      ) : !loading && !hasError ? (
        <ProbeEmptyState>{t("networkProbe.egress.empty")}</ProbeEmptyState>
      ) : null}
    </ProbePanelShell>
  )
}
