/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import { isTauri } from "@tauri-apps/api/core"

export function isDesktopRuntime(): boolean {
  try {
    return isTauri()
  } catch {
    return false
  }
}
