import { invoke } from "@tauri-apps/api/core";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";

export function getSystemInfo() {
  return invoke<SystemInfoData>("get_system_info");
}
