/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface KillPidResult {
  pid: number
  success: boolean
  message: string
  /** Stable identifier the UI branches on; missing on success.
   *  Known values: PID_GONE | PID_REUSED | PERMISSION_DENIED | SELF_KILL | CHILD_KILL | CHILD_KILL_FAILED | INVALID_PID | IDENTITY_UNAVAILABLE | KILL_FAILED | SPAWN_FAILED */
  error_code?: string | null
}

export interface KillTarget {
  pid: number
  /** Process name observed at scan time. Required for termination: the backend
   *  refuses to signal a PID when the scan-time identity is unavailable. */
  expected_name: string | null
  /** Opaque backend token binding this PID to the process observed during scan. */
  expected_identity: string | null
}

export interface ProcessNode {
  pid: number
  ppid: number
  name: string
  command: string
  /** Opaque process identity for safe termination; never shown in the UI. */
  identity: string | null
  has_children: boolean
  children: ProcessNode[]
}

export interface ProcessChildrenPage {
  parent_pid: number
  children: ProcessNode[]
  next_after_pid: number | null
}

export interface ProcessFingerprint {
  category: string
  name: string
  icon: string
}

export interface PortProcessDetail {
  port: number
  pids: number[]
  process_trees: ProcessNode[]
  fingerprint: ProcessFingerprint | null
  error: string | null
}
