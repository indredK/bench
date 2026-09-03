/**
 * InlineErrorBar / 区域内联错误条: persistent region error with retry + dismiss.
 * 区域级持久错误 UI（区别于瞬态 toast），Retry 复用该区域既有刷新函数。
 */
import { AlertCircle, RotateCw, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function InlineErrorBar({
  message,
  onRetry,
  onDismiss,
  className,
  retrying,
}: {
  message: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
  retrying?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive" className={cn("shrink-0 py-1.5", className)} role="alert">
      <AlertCircle className="size-3.5" />
      <AlertDescription className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 break-words">{message}</span>
        <span className="flex shrink-0 items-center gap-1">
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRetry}
              disabled={retrying}
              aria-label={t("common.retry")}
            >
              <RotateCw className={cn("size-3", retrying && "animate-spin")} />
            </Button>
          )}
          {onDismiss && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onDismiss}
              aria-label={t("common.actions.close")}
            >
              <X className="size-3" />
            </Button>
          )}
        </span>
      </AlertDescription>
    </Alert>
  )
}
