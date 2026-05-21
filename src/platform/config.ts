export interface PlatformConfig {
  killCommand: string;
  killHintTemplate: string;
  freePortCommandTemplate: string;
  portsCommand: string;
}

export interface AppManagerPlatformConfig {
  revealActionLabel: string;
  fileManagerName: string;
  packageManagers: string[];
  primaryPackageManager: string | null;
}

export type PlatformName = "macos" | "linux" | "windows";

function detectPlatform(): PlatformName {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macos";
  if (ua.includes("windows") || ua.includes("win64")) return "windows";
  if (ua.includes("linux")) return "linux";
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "macos";
  if (p.includes("win")) return "windows";
  return "linux";
}

const CONFIGS: Record<string, PlatformConfig> = {
  macos: {
    killCommand: "kill -9",
    killHintTemplate: "kill -9 PID {{pid}}",
    freePortCommandTemplate: "lsof -ti :{{port}} | xargs kill -9",
    portsCommand: "lsof -i :{{port}}",
  },
  linux: {
    killCommand: "kill -9",
    killHintTemplate: "kill -9 PID {{pid}}",
    freePortCommandTemplate: "lsof -ti :{{port}} | xargs kill -9",
    portsCommand: "lsof -i :{{port}}",
  },
  windows: {
    killCommand: "taskkill /F",
    killHintTemplate: "taskkill /PID {{pid}} /F",
    freePortCommandTemplate: "netstat -ano | findstr :{{port}} → taskkill /F",
    portsCommand: "netstat -ano | findstr :{{port}}",
  },
};

const APP_MANAGER_CONFIGS: Record<PlatformName, AppManagerPlatformConfig> = {
  macos: {
    revealActionLabel: "appManager.actionRevealMacos",
    fileManagerName: "Finder",
    packageManagers: ["brew"],
    primaryPackageManager: "brew",
  },
  linux: {
    revealActionLabel: "appManager.actionRevealLinux",
    fileManagerName: "File Manager",
    packageManagers: ["flatpak", "snap", "apt"],
    primaryPackageManager: null,
  },
  windows: {
    revealActionLabel: "appManager.actionRevealWindows",
    fileManagerName: "Explorer",
    packageManagers: ["winget"],
    primaryPackageManager: "winget",
  },
};

export const platformName: PlatformName = detectPlatform();
export const platformConfig: PlatformConfig = CONFIGS[platformName];
export const appManagerPlatformConfig: AppManagerPlatformConfig = APP_MANAGER_CONFIGS[platformName];