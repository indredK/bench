/**
 * SettingToggle / 设置开关: reusable toggle component; 通用开关组件.
 */
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  loading?: boolean;
  onOpenSettings?: () => void;
}

export function SettingToggle({
  label,
  description,
  checked,
  onCheckedChange,
  loading,
  onOpenSettings,
}: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <div
          className={cn(
            "flex items-center gap-1.5",
            onOpenSettings && "cursor-pointer",
          )}
          onClick={onOpenSettings}
        >
          <Label className="text-sm font-medium hover:text-foreground transition-colors">
            {label}
          </Label>
          {onOpenSettings && (
            <ExternalLink
              size={12}
              className="text-muted-foreground hover:text-foreground transition-colors"
            />
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        loading={loading}
      />
    </div>
  );
}
