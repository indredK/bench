export interface PlatformConfig {
  killCommand: string;
  killHintTemplate: string;
  freePortCommandTemplate: string;
  portsCommand: string;
}

function detectPlatform(): "macos" | "linux" | "windows" {
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

export const platformConfig: PlatformConfig = CONFIGS[detectPlatform()];