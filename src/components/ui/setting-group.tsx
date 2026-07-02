/**
 * SettingGroup / 设置分组: group container; 分组容器.
 */
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

interface SettingGroupProps {
  title: string;
  children: ReactNode;
  className?: string;
  onTitleClick?: () => void;
}

export function SettingGroup({ title, children, className, onTitleClick }: SettingGroupProps) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <h3
        className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
          onTitleClick ? "cursor-pointer hover:text-foreground transition-colors" : ""
        }`}
        onClick={onTitleClick}
      >
        {title}
        {onTitleClick && <ExternalLink size={11} />}
      </h3>
      <div className="rounded-lg border bg-card p-3 space-y-0">{children}</div>
    </div>
  );
}
