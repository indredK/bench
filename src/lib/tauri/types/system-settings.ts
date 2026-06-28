/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */

export interface SleepConfig {
  prevent_sleep: boolean;
  prevent_display: boolean;
  auto_disable_on_exit: boolean;
}

export interface SleepState {
  enabled: boolean;
  since: number | null;
  config: SleepConfig;
}

export interface SettingResult {
  success: boolean;
  message: string;
}

export interface LoginItem {
  name: string;
  enabled: boolean;
}

export interface LaunchService {
  name: string;
  path: string;
  enabled: boolean;
}

export interface TccPermission {
  service: string;
  allowed: string[];
  denied: string[];
}

export interface PingResult {
  host: string;
  packets_sent: number;
  packets_received: number;
  min_rtt: number;
  avg_rtt: number;
  max_rtt: number;
  loss_percent: number;
}

export interface DnsRecord {
  record_type: string;
  value: string;
}

export interface PortCheckResult {
  host: string;
  port: number;
  open: boolean;
  error: string | null;
}

export interface TracerouteHop {
  hop: number;
  host: string | null;
  rtt: number[];
}

export interface IpInfo {
  local_ip: string;
  external_ip: string | null;
}

export interface WifiInfo {
  ssid: string;
  signal_strength: number | null;
  channel: string | null;
  frequency: string | null;
  security: string | null;
}

/**
 * 菜单栏自动隐藏模式 (对应 macOS 系统设置中的四态选项)
 *
 * 对应 NSGlobalDomain 中两个键的组合:
 * - never:               AppleMenuBarVisibleInFullscreen=true,  _HIHideMenuBar=false
 * - in_full_screen_only: AppleMenuBarVisibleInFullscreen=false, _HIHideMenuBar=false (默认)
 * - on_desktop_only:     AppleMenuBarVisibleInFullscreen=true,  _HIHideMenuBar=true
 * - always:              AppleMenuBarVisibleInFullscreen=false, _HIHideMenuBar=true
 */
export type MenuBarAutoHideMode =
  | "never"
  | "in_full_screen_only"
  | "on_desktop_only"
  | "always";

/**
 * 低电量模式 (对应 macOS 系统设置中的四态选项)
 *
 * 对应 pmset 的 Battery/AC 分别设置:
 * - never:              pmset -b 0, -c 0 (永不)
 * - always:             pmset -b 1, -c 1 (始终)
 * - on_battery_only:    pmset -b 1, -c 0 (仅使用电池时)
 * - on_ac_only:         pmset -b 0, -c 1 (仅适用电源适配器时)
 */
export type LowPowerMode =
  | "never"
  | "always"
  | "on_battery_only"
  | "on_ac_only";

/**
 * Gatekeeper 允许来源 (对应 macOS 隐私与安全性中的选项)
 *
 * 对应 spctl 命令:
 * - app_store:              spctl -v --status 显示 "developer id disabled"
 * - identified_developers:  spctl -v --status 显示 "developer id enabled"
 */
export type GatekeeperMode =
  | "app_store"
  | "identified_developers";
