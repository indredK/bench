import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export function getCloseBehavior() {
  return invokeTauriCommand(TAURI_COMMANDS.appPreferences.getCloseBehavior);
}

export function setCloseBehavior(behavior: string) {
  return invokeTauriCommand(TAURI_COMMANDS.appPreferences.setCloseBehavior, { behavior });
}

export function quitApp() {
  return invokeTauriCommand(TAURI_COMMANDS.appPreferences.quitApp);
}

export function hideMainWindow() {
  return invokeTauriCommand(TAURI_COMMANDS.appPreferences.hideMainWindow);
}
