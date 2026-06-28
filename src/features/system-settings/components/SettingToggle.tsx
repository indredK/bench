/**
 * SettingToggle / 设置开关: reusable toggle component; 通用开关组件.
 */
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  loading?: boolean;
}

export function SettingToggle({
  label,
  description,
  checked,
  onCheckedChange,
  loading,
}: SettingToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
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
