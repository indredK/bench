/**
 * Common UI / 通用 UI: share cross-feature UI; 只放跨功能通用界面.
 */
import { Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DesktopOnlyProps {
  title: string;
  icon?: React.ReactNode;
  description?: string;
}

export function DesktopOnly({ title, icon, description }: DesktopOnlyProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-muted-foreground">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        {icon || <Monitor size={32} className="opacity-40" />}
      </div>
      <div className="text-center max-w-sm space-y-1">
        <h3 className="font-semibold text-foreground text-base">{title}</h3>
        <p className="text-sm">{description || t("common.desktopOnly")}</p>
      </div>
    </div>
  );
}
