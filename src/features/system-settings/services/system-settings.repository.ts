/**
 * Repository / 仓储层: adapt external APIs; 适配外部 API.
 */
import * as commands from "@/lib/tauri/commands/system-settings"

export const systemSettingsRepository = {
  ...commands,
}
