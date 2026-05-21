import { canUseTauriWindow } from "@/platform/capabilities";

interface AppWindow {
  setTitle: (title: string) => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
}

let cachedWindow: AppWindow | null = null;

export async function getCurrentAppWindow(): Promise<AppWindow> {
  assertTauriWindowAvailable();
  if (cachedWindow) return cachedWindow;

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  cachedWindow = await getCurrentWindow();
  return cachedWindow;
}

export async function getAppWindowByLabel(label: string): Promise<AppWindow | null> {
  if (!canUseTauriWindow()) return null;

  const { Window } = await import("@tauri-apps/api/window");
  return Window.getByLabel(label);
}

export async function setCurrentWindowTitle(title: string): Promise<void> {
  if (!canUseTauriWindow()) return;

  const win = await getCurrentAppWindow();
  await win.setTitle(title);
}

export function canUseWindowControls(): boolean {
  return canUseTauriWindow();
}

function assertTauriWindowAvailable() {
  if (!canUseTauriWindow()) {
    throw new Error("Tauri window APIs are only available in the desktop runtime.");
  }
}
