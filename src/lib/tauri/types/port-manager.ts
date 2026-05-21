/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface KillPidResult {
  pid: number;
  success: boolean;
  message: string;
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
