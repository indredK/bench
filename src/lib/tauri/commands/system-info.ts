import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function getSystemInfo() {
  return invokeTauriCommand(TAURI_COMMANDS.portManager.getSystemInfo);
}
