/**
 * Feature UI / 功能界面: security authorization gate (S-SEC-01).
 */
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

interface SecurityAuthGateProps {
  authorized: boolean
  onAuthorize: () => void
  onRevoke: () => void
}

export function SecurityAuthGate({ authorized, onAuthorize, onRevoke }: SecurityAuthGateProps) {
  const { t } = useTranslation()

  if (authorized) {
    return (
      <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
        <p className="text-muted-foreground">{t("networkProbe.security.auth.confirmed")}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onRevoke}>
          {t("networkProbe.security.auth.revoke")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-3">
      <p className="text-sm font-medium">{t("networkProbe.security.auth.title")}</p>
      <p className="text-muted-foreground text-sm">{t("networkProbe.security.auth.body")}</p>
      <Button type="button" onClick={onAuthorize}>
        {t("networkProbe.security.auth.confirm")}
      </Button>
    </div>
  )
}
