/**
 * api-billing view models / 视图模型: local UI-only types; 只放前端视图类型.
 */
import type { ProbeStrategy } from "@/features/api-billing/api";

/** 站点新增/编辑对话框里的 Session Manager 高级设置。 */
export type SessionSettings = {
  probeOverride: boolean;
  probeStrategy: ProbeStrategy;
  sessionTtlHours: number;
};

/** 详情面板中一行的展示描述。 */
export type DetailRow = {
  label: string;
  value: string;
  truncate?: boolean;
  copy?: boolean;
  onCopy?: () => void | Promise<void>;
  reveal?: { hidden: boolean; onToggle: () => void; loading?: boolean };
};
