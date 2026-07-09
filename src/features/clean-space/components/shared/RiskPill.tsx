/**
 * Risk Pill / 风险标签: shared across clean-space tools; 跨工具复用的风险标签.
 */
import { Shield, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RiskLevel } from "@/lib/tauri/types/dev-cleaner"

const RISK_CONFIG: Record<RiskLevel, { icon: typeof Shield; className: string; labelKey: string }> = {
  safe: {
    icon: ShieldCheck,
    className: "text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/30 dark:border-green-800",
    labelKey: "cleanSpace.risk.safe",
  },
  low: {
    icon: Shield,
    className: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800",
    labelKey: "cleanSpace.risk.low",
  },
  medium: {
    icon: ShieldAlert,
    className: "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800",
    labelKey: "cleanSpace.risk.medium",
  },
  high: {
    icon: ShieldOff,
    className: "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-800",
    labelKey: "cleanSpace.risk.high",
  },
}

export function RiskPill({ level }: { level: RiskLevel }) {
  const { t } = useTranslation()
  const config = RISK_CONFIG[level]
  const Icon = config.icon
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-[10px] font-medium", config.className)}
    >
      <Icon size={10} />
      {t(config.labelKey)}
    </Badge>
  )
}
