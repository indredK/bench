/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import { getSystemInfo } from "@/lib/tauri/commands/system-info"

export const systemInfoRepository = { getSystemInfo }
