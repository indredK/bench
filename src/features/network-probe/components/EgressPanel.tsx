/**
 * Feature UI / 功能界面: public egress IP (dual entry with Offline).
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { PublicIpInfo } from "@/lib/tauri/types/network-probe"

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
          <Button type="button" disabled={loading} onClick={onRun}>
            {loading ? t("networkProbe.egress.running") : t("networkProbe.egress.run")}
          </Button>
          <p className="text-muted-foreground font-mono text-xs">{t("networkProbe.cmd.egress")}</p>
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
      ) : (
        <p className="text-muted-foreground text-sm">{t("networkProbe.egress.empty")}</p>
      )}
    </ProbePanelShell>
  )
}
