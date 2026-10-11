/**
 * Localized site-probe failure summary with an optional collapsed raw diagnostic.
 */
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface SiteProbeFailureProps {
  error?: string | null
  className?: string
  showSummary?: boolean
}

export function SiteProbeFailure({ error, className, showSummary = true }: SiteProbeFailureProps) {
  const { t } = useTranslation()

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      {showSummary ? <p className="text-destructive">{t("networkProbe.sites.failed")}</p> : null}
      {error ? (
        <details className="text-muted-foreground min-w-0 text-left text-xs">
          <summary className="cursor-pointer select-none">
            {t("networkProbe.sites.failureDetails")}
          </summary>
          <pre className="bg-muted mt-1 max-w-full overflow-x-auto rounded px-2 py-1 font-mono text-[11px] break-all whitespace-pre-wrap">
            {error}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
