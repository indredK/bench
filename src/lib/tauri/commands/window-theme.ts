/**
 * IPC Commands / 通信命令: window theme; 只封装窗口主题命令.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import { canUseTauriCommands } from "@/platform/capabilities"

export type WindowThemeId = "default" | "glass"
export type WindowAppearance = "light" | "dark"

export function setWindowTheme(theme: WindowThemeId, appearance: WindowAppearance) {
  if (!canUseTauriCommands()) return Promise.resolve()
  return invokeTauriCommand(TAURI_COMMANDS.windowTheme.setWindowTheme, {
    theme,
    appearance,
  })
}
