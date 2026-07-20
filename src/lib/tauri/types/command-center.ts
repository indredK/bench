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
}

export interface RunResult {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
}
