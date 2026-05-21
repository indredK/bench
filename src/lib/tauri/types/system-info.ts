/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
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
