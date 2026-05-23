/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface KillPidResult {
  pid: number;
  success: boolean;
  message: string;
  /** Stable identifier the UI branches on; missing on success.
   *  Known values: PID_GONE | PID_REUSED | PERMISSION_DENIED | SELF_KILL | CHILD_KILL | KILL_FAILED | SPAWN_FAILED */
  error_code?: string | null;
}

export interface KillTarget {
  pid: number;
  /** Process name observed at scan time. Backend rejects with PID_REUSED if the
   *  live process now has a different name, preventing accidental sshd kills. */
  expected_name: string | null;
}

export interface ProcessNode {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  children: ProcessNode[];
}

export interface ProcessFingerprint {
  category: string;
  name: string;
  icon: string;
}

export interface PortProcessDetail {
  port: number;
  pids: number[];
  process_trees: ProcessNode[];
  fingerprint: ProcessFingerprint | null;
  error: string | null;
}
