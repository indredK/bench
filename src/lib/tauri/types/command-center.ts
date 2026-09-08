/**
 * Command Center Types / 命令中心类型: mirror payload shapes only; 只镜像数据形状.
 */

export type CardKind = "shell" | "shellAdmin" | "copy" | "open"

export interface CommandCard {
  id: string
  title: string
  description: string
  kind: CardKind
  command: string
  icon?: string | null
  createdAt: number
  updatedAt: number
  /** 命令市场来源（P5；缺省 = 本地手建卡片）。 */
  market?: MarketProvenance | null
}

/** 命令市场来源标记。 */
export interface MarketProvenance {
  version: string
  installedAt: number
}

/** 市场命令条目（Rust MarketCommandDto；不含下载地址 —— D-007 同款信任边界）。 */
export interface MarketCommandSummary {
  id: string
  version: string
  title: string
  description: string
  kind: CardKind
  installed: boolean
  upgradable: boolean
}

/** 命令市场列表（Rust CommandMarketListing）。 */
export interface CommandMarketListing {
  source: string | null
  updatedAt: string | null
  commands: MarketCommandSummary[]
}

export interface RunResult {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
}
