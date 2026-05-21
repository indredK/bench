/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import { open as openExternalUrl } from "@tauri-apps/plugin-shell";
import { canUseTauriShell } from "@/platform/capabilities";

export function openExternal(reference: string) {
  if (canUseTauriShell()) {
    return openExternalUrl(reference);
  }

  window.open(reference, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}
