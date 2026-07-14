/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 * Clean Space / 存储空间清理模块类型。
 */
import type { RiskLevel } from "@/lib/tauri/types/dev-cleaner"

export type PriorityTier = "P1" | "P2" | "P3"
export type CleanupProtectionKind =
  | "none"
  | "app_bundle"
  | "app_state"
  | "cross_user_data"
  | "read_only_system"
  | "system_critical"
  | "user_data"
  | "missing_cleanup_rule"

export interface StorageItem {
  id: string
  name: string
  category_id: string
  risk_level: RiskLevel
  size_bytes: number
  command: string
  is_cleanable: boolean
  protection_kind: CleanupProtectionKind
  protection_reason: string
  path: string
  files: string
  reason: string
  priority: PriorityTier
  score: number
}

export interface StorageCategory {
  id: string
  name: string
  color: string
  total_bytes: number
  items: StorageItem[]
}

export interface StorageOverview {
  disk_total_bytes: number
  categories: StorageCategory[]
}

export interface ScanStartPayload {
  disk_total_bytes: number
  disk_used_bytes: number
}

export interface CleanupRecord {
  id: string
  timestamp: number
  title: string
  scope: string
  items: number
  freed_bytes: number
  high_risk_count: number
  status: "ok" | "warn"
}

export interface CategoryCleanupResult {
  success: boolean
  freed_bytes: number
  items_cleaned: number
  items_failed: number
  aborted: boolean
  results: CleanupItemResult[]
}

export type CleanupItemStatus = "cleaned" | "failed" | "rejected"

export interface CleanupItemResult {
  id: string
  status: CleanupItemStatus
  freed_bytes: number
  error_code: string | null
}

export interface CleanupItemInput {
  id: string
  category_id: string
  command: string
  path: string
  size_bytes: number
}

export interface FolderScanResult {
  freed_bytes: number
  item_count: number
  items: StorageItem[]
}
