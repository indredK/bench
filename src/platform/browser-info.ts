/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import type { SystemInfoData } from "@/lib/tauri/types/system-info";

export function getBrowserSystemInfo(): SystemInfoData {
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const { browserName, browserVersion } = detectBrowser(ua);

  return {
    os_name: detectPlatform(ua),
    os_version: "Unknown",
    kernel_version: "Unknown",
    hostname: "Unknown",
    cpu_brand: "Unknown",
    cpu_cores: 0,
    total_memory: 0,
    available_memory: 0,
    used_memory: 0,
    memory_usage_percent: 0,
    uptime_seconds: 0,
    arch: nav.userAgentData?.platform || navigator.platform || "Unknown",
    model_name: "",
    distribution: "",
    browser_name: browserName,
    browser_version: browserVersion,
    language: navigator.language,
    screen_resolution: `${window.screen.width} x ${window.screen.height}`,
  };
}

function detectBrowser(ua: string): { browserName: string; browserVersion: string } {
  if (ua.includes("Firefox")) {
    return {
      browserName: "Firefox",
      browserVersion: matchVersion(ua, /Firefox\/(\d+\.\d+)/),
    };
  }

  if (ua.includes("Edg")) {
    return {
      browserName: "Edge",
      browserVersion: matchVersion(ua, /Edg\/(\d+\.\d+)/),
    };
  }

  if (ua.includes("Chrome")) {
    return {
      browserName: "Chrome",
      browserVersion: matchVersion(ua, /Chrome\/(\d+\.\d+)/),
    };
  }

  if (ua.includes("Safari")) {
    return {
      browserName: "Safari",
      browserVersion: matchVersion(ua, /Version\/(\d+\.\d+)/),
    };
  }

  return {
    browserName: "Unknown",
    browserVersion: "Unknown",
  };
}

function detectPlatform(ua: string): string {
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "MacOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown";
}

function matchVersion(ua: string, pattern: RegExp): string {
  return ua.match(pattern)?.[1] ?? "Unknown";
}
