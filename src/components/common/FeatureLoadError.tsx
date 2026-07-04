/**
 * Common UI / 通用 UI: persistent feature load failure state; 只展示功能加载失败态.
 */
import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

interface FeatureLoadErrorProps {
  title: string
  description: string
  icon?: ReactNode
  onRetry?: () => void
}

export function FeatureLoadError({ title, description, icon, onRetry }: FeatureLoadErrorProps) {
  const { t } = useTranslation()

  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-5">
      <div className="bg-muted flex size-16 items-center justify-center rounded-full">
        {icon || <AlertTriangle size={32} className="opacity-50" />}
      </div>
      <div className="max-w-md space-y-1 text-center">
        <h3 className="text-foreground text-base font-semibold">{title}</h3>
        <p className="text-sm">{description}</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  )
}
