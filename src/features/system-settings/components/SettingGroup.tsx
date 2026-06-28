/**
 * SettingGroup / 设置分组: group container; 分组容器.
 */
import type { ReactNode } from "react";

interface SettingGroupProps {
  title: string;
  children: ReactNode;
}

export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="rounded-lg border bg-card p-3 space-y-0">{children}</div>
    </div>
  );
}
