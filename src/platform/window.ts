/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import { canUseTauriWindow } from "@/platform/capabilities"

interface AppWindow {
  setTitle: (title: string) => Promise<void>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  show: () => Promise<void>
  hide: () => Promise<void>
  setFocus: () => Promise<void>
  startDragging: () => Promise<void>
  setAlwaysOnTop: (onTop: boolean) => Promise<void>
  isAlwaysOnTop: () => Promise<boolean>
}

let cachedWindow: AppWindow | null = null

// Number of attempts and per-attempt delay before giving up on the Tauri
// runtime exposing a current window. Tauri normally returns the window
// reference synchronously, but during very early startup the bridge may
// not be wired up yet — retrying briefly avoids spurious crashes in the
// titlebar / theme bootstrap path (#095).
const CURRENT_WINDOW_MAX_ATTEMPTS = 30
const CURRENT_WINDOW_RETRY_DELAY_MS = 50

export async function getCurrentAppWindow(): Promise<AppWindow> {
  assertTauriWindowAvailable()
  if (cachedWindow) return cachedWindow

  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  for (let attempt = 0; attempt < CURRENT_WINDOW_MAX_ATTEMPTS; attempt += 1) {
    try {
      const win = getCurrentWindow()
      if (win) {
        cachedWindow = win
        return cachedWindow
      }
    } catch {
      /* swallow and retry */
    }
    await new Promise((resolve) => window.setTimeout(resolve, CURRENT_WINDOW_RETRY_DELAY_MS))
  }
  throw new Error("Tauri current window was not available after retries")
}

export async function getAppWindowByLabel(label: string): Promise<AppWindow | null> {
  if (!canUseTauriWindow()) return null

  const { Window } = await import("@tauri-apps/api/window")
  return Window.getByLabel(label)
}

export async function setCurrentWindowTitle(title: string): Promise<void> {
  if (!canUseTauriWindow()) return

  const win = await getCurrentAppWindow()
  await win.setTitle(title)
}

export function canUseWindowControls(): boolean {
  return canUseTauriWindow()
}

function assertTauriWindowAvailable() {
  if (!canUseTauriWindow()) {
    throw new Error("Tauri window APIs are only available in the desktop runtime.")
  }
}
