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

export interface SystemInfoData {
  os_name: string;
  os_version: string;
  kernel_version: string;
  hostname: string;
  cpu_brand: string;
  cpu_cores: number;
  total_memory: number;
  available_memory: number;
  used_memory: number;
  memory_usage_percent: number;
  uptime_seconds: number;
  arch: string;
  model_name: string;
  distribution: string;
  browser_name?: string;
  browser_version?: string;
  platform?: string;
  language?: string;
  screen_resolution?: string;
}
