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
  if (cachedWindow) return cachedWindow;

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  cachedWindow = await getCurrentWindow();
  return cachedWindow;
}

export async function getAppWindowByLabel(label: string): Promise<AppWindow | null> {
  const { Window } = await import("@tauri-apps/api/window");
  return Window.getByLabel(label);
}
