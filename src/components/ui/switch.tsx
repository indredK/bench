import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SwitchProps {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
  className?: string
}

// 受控开关组件：支持加载状态动画（loading 时显示旋转图标并禁用交互）
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked = false, onCheckedChange, disabled, loading = false, className, ...props }, ref) => {
    const isDisabled = disabled || loading
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={loading}
        disabled={isDisabled}
        onClick={() => {
          if (loading) return
          onCheckedChange?.(!checked)
        }}
        className={cn(
          "peer focus-visible:ring-ring inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
          loading && "cursor-progress",
          className,
        )}
        {...props}
      >
        {loading ? (
          // 加载状态：在 thumb 位置显示旋转图标，保持开关尺寸不变
          <Loader2Icon
            className={cn(
              "text-muted-foreground pointer-events-none block h-3.5 w-3.5 shrink-0 animate-spin shadow-lg ring-0 transition-transform",
              checked ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        ) : (
          <span
            className={cn(
              "bg-background pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform",
              checked ? "translate-x-4" : "translate-x-0",
            )}
          />
        )}
      </button>
    )
  },
)
Switch.displayName = "Switch"

export { Switch }
