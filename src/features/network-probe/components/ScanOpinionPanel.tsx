/**
 * Feature UI / 功能界面: advisor opinions from health scan.
 */
import { useTranslation } from "react-i18next"
import type { HealthOpinion, HealthScanResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface ScanOpinionPanelProps {
  result: HealthScanResult | null
  onGoTree: () => void
}

export function ScanOpinionPanel({ result, onGoTree }: ScanOpinionPanelProps) {
  const { t } = useTranslation()
  const opinions = result?.opinions ?? []

  if (!result) {
    return (
      <div className="space-y-3 py-6">
        <p className="text-muted-foreground text-sm">{t("networkProbe.opinion.empty")}</p>
        <button
          type="button"
          className="text-primary text-sm underline-offset-2 hover:underline"
          onClick={onGoTree}
        >
          {t("networkProbe.opinion.goTree")}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("networkProbe.opinion.hint")}</p>
      {opinions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.opinion.none")}</p>
      ) : (
        <ul className="space-y-2">
          {opinions.map((op) => (
            <OpinionCard key={op.id} opinion={op} />
          ))}
        </ul>
      )}
    </div>
  )
}

function OpinionCard({ opinion }: { opinion: HealthOpinion }) {
  const { t } = useTranslation()
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        opinion.severity === "critical" && "border-destructive/40 bg-destructive/5",
        opinion.severity === "warn" && "border-amber-500/40 bg-amber-500/5",
        opinion.severity === "info" && "bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium tracking-wide uppercase">
          {t(`networkProbe.opinion.severity.${opinion.severity}`)}
        </span>
        <span className="font-medium">{t(opinion.titleKey)}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{t(opinion.bodyKey)}</p>
      {opinion.relatedKeys.length > 0 ? (
        <p className="text-muted-foreground mt-1 font-mono text-[10px]">
          {opinion.relatedKeys.join(", ")}
        </p>
      ) : null}
    </li>
  )
}
