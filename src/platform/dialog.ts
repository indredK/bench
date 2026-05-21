import type {
  OpenDialogOptions,
  OpenDialogReturn,
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
