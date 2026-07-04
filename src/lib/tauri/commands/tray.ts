/**
 * IPC Commands / 通信命令: tray menu control; 只封装托盘菜单调用.
 */
import { TAURI_COMMANDS } from "@/lib/tauri/contracts";
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import { canUseTauriCommands } from "@/platform/capabilities";

export function setTrayLabels(labels: {
  show: string;
  sleep: string;
  autostart: string;
  quit: string;
}) {
  if (!canUseTauriCommands()) return Promise.resolve();
  return invokeTauriCommand(TAURI_COMMANDS.tray.setTrayLabels, labels);
}
