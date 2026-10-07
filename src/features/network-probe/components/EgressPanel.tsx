/**
 * Feature UI / 功能界面: public egress IP (dual entry with Offline).
 */
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { PublicIpResult } from "@/features/network-probe/components/PublicIpResult"
import type { PublicIpInfo } from "@/lib/tauri/types/network-probe"
import { useTranslation } from "react-i18next"

interface EgressPanelProps {
  loading: boolean
  result: PublicIpInfo | null
  onRun: () => void
  dualFrom?: "offline" | "test"
}

export function EgressPanel({ loading, result, onRun, dualFrom }: EgressPanelProps) {
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
        <PublicIpResult result={result} />
      ) : (
        <p className="text-muted-foreground text-sm">{t("networkProbe.egress.empty")}</p>
      )}
    </ProbePanelShell>
  )
}
