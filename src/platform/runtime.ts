import { isTauri } from "@tauri-apps/api/core";

export function isDesktopRuntime(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}
