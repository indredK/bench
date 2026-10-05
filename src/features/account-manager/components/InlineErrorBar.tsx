/**
 * InlineErrorBar / 区域内联错误条: persistent region error with retry + dismiss.
 * 区域级持久错误 UI（区别于瞬态 toast），Retry 复用该区域既有刷新函数。
 */
import { AlertCircle, RotateCw, X } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function InlineErrorBar({
  message,
  onRetry,
  retryLabel,
  onDismiss,
  className,
  retrying,
}: {
  message: string
  onRetry?: () => unknown
  retryLabel?: string
  onDismiss?: () => void
  className?: string
  retrying?: boolean
}) {
  const { t } = useTranslation()
  const retryLockRef = useRef(false)
  const [retryPending, setRetryPending] = useState(false)
  const isRetrying = retrying || retryPending
  const handleRetry = () => {
    if (!onRetry || retryLockRef.current) return
    retryLockRef.current = true
    setRetryPending(true)
    void Promise.resolve()
      .then(onRetry)
      .catch(() => undefined)
      .finally(() => {
        retryLockRef.current = false
        setRetryPending(false)
      })
  }
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
              onClick={handleRetry}
              disabled={isRetrying}
              aria-label={retryLabel ?? t("common.retry")}
            >
              <RotateCw className={cn("size-3", isRetrying && "animate-spin")} />
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
