import { Loader2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SettingChoiceButtonsProps<T extends string | number> {
  value: T | null
  options: readonly { value: T; label: string }[]
  loading?: boolean
  disabled?: boolean
  onSelect: (value: T) => void
  className?: string
}

/** 多选一按钮组：加载中不高亮任何选项，末尾显示旋转图标 */
export function SettingChoiceButtons<T extends string | number>({
  value,
  options,
  loading = false,
  disabled = false,
  onSelect,
  className,
}: SettingChoiceButtonsProps<T>) {
  const { t } = useTranslation()
  const isDisabled = loading || disabled

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map(({ value: optionValue, label }) => (
        <Button
          key={String(optionValue)}
          type="button"
          variant={!loading && value === optionValue ? "default" : "outline"}
          size="sm"
          disabled={isDisabled}
          onClick={() => {
            if (value === optionValue) return
            onSelect(optionValue)
          }}
        >
          {label}
        </Button>
      ))}
      {loading && (
        <Loader2Icon
          className="text-muted-foreground h-3.5 w-3.5 shrink-0 animate-spin"
          aria-label={t("common.loading")}
        />
      )}
    </div>
  )
}
