/**
 * SettingToggle / 设置开关: reusable toggle component; 通用开关组件.
 */
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CircleOff, CirclePower, ExternalLink } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface SettingToggleProps {
  label: string
  description?: string
  checked: boolean | null
  onCheckedChange: (checked: boolean) => void
  loading?: boolean
  onOpenSettings?: () => void
}

export function SettingToggle({
  label,
  description,
  checked,
  onCheckedChange,
  loading,
  onOpenSettings,
}: SettingToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <div
          className={cn("flex items-center gap-1.5", onOpenSettings && "cursor-pointer")}
          onClick={onOpenSettings}
        >
          <Label className="hover:text-foreground text-sm font-medium transition-colors">
            {label}
          </Label>
          {onOpenSettings && (
            <ExternalLink
              size={12}
              className="text-muted-foreground hover:text-foreground transition-colors"
            />
          )}
        </div>
        {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
      </div>
      {checked === null ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{t("common.unknown")}</Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={loading}
                  onClick={() => onCheckedChange(false)}
                  aria-label={t("common.disable")}
                >
                  <CircleOff />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("common.disable")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={loading}
                  onClick={() => onCheckedChange(true)}
                  aria-label={t("common.enable")}
                >
                  <CirclePower />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("common.enable")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <Switch checked={checked} onCheckedChange={onCheckedChange} loading={loading} />
      )}
    </div>
  )
}
