import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

export function ProbeSystemDetails({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <details className="text-xs">
      <summary className="text-muted-foreground cursor-pointer">
        {t("networkProbe.systemDetail")}
      </summary>
      <div className="text-muted-foreground mt-1" dir="auto">
        {children}
      </div>
    </details>
  )
}
