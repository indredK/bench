/**
 * account-manager view models / 视图模型: local UI-only types; 只放前端视图类型.
 */
import type { NetworkProxyConfig, ProbeStrategy } from "@/lib/tauri/types/account-manager"

/** 站点新增/编辑对话框里的 Session Manager 高级设置。 */
export type SessionSettings = {
  probeOverride: boolean
  probeStrategy: ProbeStrategy
  sessionTtlHours: number
  /** v1.18 — per-station 网络代理配置。null = 直连(无代理)。 */
  networkProxy: NetworkProxyConfig | null
  /** 代理密码明文(仅在用户修改密码时传入); undefined = 保留, 空串 = 清除。 */
  networkProxyPassword: string | undefined
}

/** 详情面板中一行的展示描述。 */
export type DetailRow = {
  label: string
  value: string
  truncate?: boolean
  copy?: boolean
  onCopy?: () => void | Promise<void>
  reveal?: { hidden: boolean; onToggle: () => void; loading?: boolean }
}
