import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { SettingsSectionLoadStatus } from "@/features/system-settings/hooks/useSettingsSectionLoader"

interface SettingsSectionStateProps {
  status: SettingsSectionLoadStatus
  error: string
  onRetry: () => void
  children: ReactNode
}

export function SettingsSectionState({
  status,
  error,
  onRetry,
  children,
}: SettingsSectionStateProps) {
  const { t } = useTranslation()

  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{t("systemSettings.loadFailedTitle")}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <AlertAction>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  return <>{children}</>
}
