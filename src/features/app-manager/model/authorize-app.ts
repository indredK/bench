import type { AppInfo } from "@/lib/tauri/types/app-manager"
import { platformName } from "@/platform/config"

export function canAuthorizeMacApp(app: AppInfo): boolean {
  return platformName === "macos" && !app.isSystemApp && app.installPath.endsWith(".app")
}
