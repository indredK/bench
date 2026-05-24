/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import type {
  OpenDialogOptions,
  OpenDialogReturn,
  SaveDialogOptions,
} from "@tauri-apps/plugin-dialog";
import { canUseTauriDialog } from "@/platform/capabilities";

export async function openPlatformDialog<T extends OpenDialogOptions>(
  options?: T
): Promise<OpenDialogReturn<T>> {
  if (!canUseTauriDialog()) {
    return null as OpenDialogReturn<T>;
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  return open(options);
}

export async function savePlatformDialog(
  options?: SaveDialogOptions
): Promise<string | null> {
  if (!canUseTauriDialog()) {
    return null;
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  return save(options);
}
