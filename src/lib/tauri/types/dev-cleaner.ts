/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface ProjectInfo {
  path: string
  name: string
  total_size: number
  target_size: number
  last_modified: number
  dependencies_count: number
  project_type: "NodeJs" | "Python" | "Rust" | "Go" | "Mixed" | "General"
  cleanup_potential: number
  cleanup_paths?: string[]
}

export interface CleanupResult {
  success: boolean
  cleaned_size: number
  errors: string[]
}

export interface ScanResult {
  total_projects: number
  total_size: number
  total_cleanup_size: number
  projects: ProjectInfo[]
  scan_time_ms: number
  aborted: boolean
}

// ── Custom Cleanup Types ──

export type RiskLevel = "safe" | "low" | "medium" | "high"

export interface CleanupCommandDef {
  id: string
  name: string
  command: string
  environment: string
  description: string
  /** Human-readable risk detail. May be localized; display only. */
  risk: string
  /** Canonical risk level for programmatic judgments. */
  risk_level: RiskLevel
}

export interface CustomCleanupProgress {
  command_id: string
  command_name: string
  status: "running" | "completed" | "failed" | "pending"
  output: string
  freed_bytes: number
  error: string | null
}

export interface CustomCleanupFinalResult {
  success: boolean
  total_freed_bytes: number
  commands_executed: number
  commands_failed: number
  details: CustomCleanupProgress[]
  aborted: boolean
}
