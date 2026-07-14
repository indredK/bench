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

  if (status === "loading") {
    return (
      <div className="space-y-3 py-2" aria-busy="true" aria-label={t("systemSettings.loading")}>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex h-10 items-center justify-between gap-4">
            <div className="bg-muted h-3.5 w-1/3 rounded motion-safe:animate-pulse" />
            <div className="bg-muted h-5 w-10 rounded-full motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

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
