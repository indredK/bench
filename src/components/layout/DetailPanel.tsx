/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { type ReactNode } from "react"
import { X, Info } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { cn } from "@/lib/utils"

interface DetailPanelProps<T> {
  item: T | null
  onClose: () => void
  renderDetail: (item: T) => ReactNode
  title?: string
  loading?: boolean
  open: boolean
}

export function DetailPanel<T>({
  item,
  onClose,
  renderDetail,
  title,
  loading = false,
  open,
}: DetailPanelProps<T>) {
  const { t } = useTranslation()
  const resolvedTitle = title ?? t("common.details")

  return (
    <div
      className={cn(
        "bg-card flex h-full w-full shrink-0 flex-col overflow-hidden rounded-xl border",
        open ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <span className="text-foreground/70 text-xs font-semibold tracking-wider uppercase">
          {resolvedTitle}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onClose}
          aria-label={t("common.actions.close")}
        >
          <X size={14} />
        </Button>
      </div>
      <ScrollableArea className="min-h-0 flex-1 p-4" wrapperClassName="flex min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="border-muted border-t-primary size-6 animate-spin rounded-full border-2" />
            <p className="text-muted-foreground text-xs">{t("common.loading")}</p>
          </div>
        ) : item ? (
          renderDetail(item)
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center text-center">
            <Info size={32} className="mb-3 opacity-30" />
            <p className="text-sm">{t("common.empty.selectItem")}</p>
          </div>
        )}
      </ScrollableArea>
    </div>
  )
}

// --- Reusable detail sub-components ---

export function MetadataRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const resolvedValue = value || t("common.na")

  return (
    <div className="border-border/40 flex justify-between border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground mr-2 shrink-0">{label}</span>
      <span
        className="overflow-wrap-anywhere max-w-[60%] text-right font-medium break-words"
        title={resolvedValue}
      >
        {resolvedValue}
      </span>
    </div>
  )
}

export function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        {label}
      </h4>
      {children}
    </div>
  )
}
