/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface EnvTool {
  name: string;
  version: string;
  path: string;
  size_bytes: number;
  size_display: string;
  install_time: string;
  available: boolean;
  category: string;
  source: string;
  kind: string;
  status: string;
  detector: string;
  all_paths: string[];
  issue: string;
}

export interface EnvScanDonePayload {
  tools: EnvTool[];
  unavailable: EnvTool[];
}
