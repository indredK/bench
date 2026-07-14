/**
 * Shared primitives / 共享基元: small stateless building blocks used across
 * the three columns and dialogs. 三栏与对话框共用的小组件。
 */
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Check, Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { AccountSessionStatus } from "@/lib/tauri/types/account-manager"

export function ColumnHeader({ title, action }: { title: string; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <h2 className="text-sm font-semibold whitespace-nowrap">{title}</h2>
      {action}
    </div>
  )
}

export function IconButton({
  onClick,
  icon,
  label,
  disabled,
  tooltipSide = "top",
}: {
  onClick: () => void
  icon: ReactNode
  label?: string
  disabled?: boolean
  tooltipSide?: "top" | "bottom" | "left" | "right"
}) {
  const button = (
    <Button variant="ghost" size="icon-xs" onClick={onClick} aria-label={label} disabled={disabled}>
      {icon}
    </Button>
  )

  if (!label) return button

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function CopyIconButton({
  value,
  label,
  onCopy,
}: {
  value: string
  label?: string
  onCopy?: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const handleClick = async () => {
    try {
      if (onCopy) {
        await onCopy()
      } else {
        await navigator.clipboard.writeText(value)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      toast.error(t("accountManager.toasts.copyFailed"))
    }
  }
  return (
    <IconButton
      onClick={handleClick}
      icon={copied ? <Check size={14} /> : <Copy size={14} />}
      label={label}
    />
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
      {children}
    </p>
  )
}

export function Field({
  label,
  icon,
  input,
}: {
  label: string
  icon?: ReactNode
  input: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </span>
      {input}
    </label>
  )
}

export function EmptyHint({ icon, text, hint }: { icon: ReactNode; text: string; hint?: string }) {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
      {icon}
      <div>
        <p className="text-foreground text-sm font-medium">{text}</p>
        {hint && <p className="mt-1 text-sm">{hint}</p>}
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: AccountSessionStatus }) {
  const { t } = useTranslation()

  const variant = {
    ready: "secondary",
    loginRequired: "outline",
    expired: "destructive",
    fetchFailed: "outline",
    inactive: "outline",
  } as const

  const className = {
    ready: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    loginRequired: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    expired: "",
    fetchFailed: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    inactive: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  }[status]

  const dotColor = {
    ready: "bg-emerald-500",
    loginRequired: "bg-amber-500",
    expired: "bg-red-500",
    fetchFailed: "bg-slate-400",
    inactive: "bg-slate-400",
  }[status]

  return (
    <Badge variant={variant[status]} className={className}>
      <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", dotColor)} />
      {t(`accountManager.status.${status}`)}
    </Badge>
  )
}
