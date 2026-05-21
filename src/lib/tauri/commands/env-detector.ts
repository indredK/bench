import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function detectEnvTools() {
  return invokeTauriCommand(TAURI_COMMANDS.envDetector.detectEnvTools);
}
