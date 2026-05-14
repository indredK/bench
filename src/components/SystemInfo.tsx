import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@tauri-apps/api/core";

interface SystemInfoData {
  os_name: string;
  os_version: string;
  kernel_version: string;
  hostname: string;
  cpu_brand: string;
  cpu_cores: number;
  total_memory: number;
  available_memory: number;
  used_memory: number;
  memory_usage_percent: number;
  browser_name?: string;
  browser_version?: string;
  platform?: string;
  language?: string;
  screen_resolution?: string;
}

function SystemInfo() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSystemInfo();
  }, []);

  const loadSystemInfo = async () => {
    setLoading(true);
    setError("");

    try {
      if (isTauri()) {
        const info: SystemInfoData = await invoke("get_system_info");
        setSystemInfo(info);
      } else {
        const browserInfo = getBrowserInfo();
        setSystemInfo(browserInfo);
      }
    } catch (e) {
      setError(typeof e === "string" ? e : "Failed to load system information");
    } finally {
      setLoading(false);
    }
  };

  const getBrowserInfo = (): SystemInfoData => {
    const ua = navigator.userAgent;
    let browserName = "Unknown";
    let browserVersion = "Unknown";

    if (ua.includes("Firefox")) {
      browserName = "Firefox";
      const match = ua.match(/Firefox\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes("Chrome")) {
      browserName = "Chrome";
      const match = ua.match(/Chrome\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes("Safari")) {
      browserName = "Safari";
      const match = ua.match(/Version\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes("Edge")) {
      browserName = "Edge";
      const match = ua.match(/Edge\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    }

    let platform = navigator.platform;
    if (ua.includes("Win")) platform = "Windows";
    else if (ua.includes("Mac")) platform = "MacOS";
    else if (ua.includes("Linux")) platform = "Linux";
    else if (ua.includes("Android")) platform = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS";

    const screenResolution = `${window.screen.width} x ${window.screen.height}`;

    return {
      os_name: platform,
      os_version: "Unknown",
      kernel_version: "Unknown",
      hostname: "Unknown",
      cpu_brand: "Unknown",
      cpu_cores: 0,
      total_memory: 0,
      available_memory: 0,
      used_memory: 0,
      memory_usage_percent: 0,
      browser_name: browserName,
      browser_version: browserVersion,
      platform: platform,
      language: navigator.language,
      screen_resolution: screenResolution,
    };
  };

  const formatMemory = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2);
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-title">{t("systemInfo.title")}</div>
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>{t("systemInfo.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-title">{t("systemInfo.title")}</div>
        <div className="result-list">
          <div className="result-item error">
            <span className="status-dot error" />
            {error}
          </div>
        </div>
        <button className="btn btn-primary" onClick={loadSystemInfo}>
          {t("systemInfo.retry")}
        </button>
      </div>
    );
  }

  if (!systemInfo) {
    return null;
  }

  return (
    <div className="card">
      <div className="card-title">{t("systemInfo.title")}</div>
      <div className="info-grid">
        <div className="info-item">
          <div className="info-label">{t("systemInfo.osName")}</div>
          <div className="info-value">{systemInfo.os_name}</div>
        </div>
        {systemInfo.os_version !== "Unknown" && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.osVersion")}</div>
            <div className="info-value">{systemInfo.os_version}</div>
          </div>
        )}
        {systemInfo.kernel_version !== "Unknown" && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.kernelVersion")}</div>
            <div className="info-value">{systemInfo.kernel_version}</div>
          </div>
        )}
        {systemInfo.hostname !== "Unknown" && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.hostname")}</div>
            <div className="info-value">{systemInfo.hostname}</div>
          </div>
        )}
        {systemInfo.cpu_brand !== "Unknown" && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.cpuBrand")}</div>
            <div className="info-value">{systemInfo.cpu_brand}</div>
          </div>
        )}
        {systemInfo.cpu_cores > 0 && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.cpuCores")}</div>
            <div className="info-value">{systemInfo.cpu_cores}</div>
          </div>
        )}
        {systemInfo.total_memory > 0 && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.totalMemory")}</div>
            <div className="info-value">{formatMemory(systemInfo.total_memory)} GB</div>
          </div>
        )}
        {systemInfo.available_memory > 0 && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.availableMemory")}</div>
            <div className="info-value">{formatMemory(systemInfo.available_memory)} GB</div>
          </div>
        )}
        {systemInfo.used_memory > 0 && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.usedMemory")}</div>
            <div className="info-value">{formatMemory(systemInfo.used_memory)} GB</div>
          </div>
        )}
        {systemInfo.memory_usage_percent > 0 && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.memoryUsage")}</div>
            <div className="info-value">{systemInfo.memory_usage_percent.toFixed(1)}%</div>
          </div>
        )}
        {systemInfo.browser_name && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.browserName")}</div>
            <div className="info-value">{systemInfo.browser_name}</div>
          </div>
        )}
        {systemInfo.browser_version && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.browserVersion")}</div>
            <div className="info-value">{systemInfo.browser_version}</div>
          </div>
        )}
        {systemInfo.platform && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.platform")}</div>
            <div className="info-value">{systemInfo.platform}</div>
          </div>
        )}
        {systemInfo.language && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.language")}</div>
            <div className="info-value">{systemInfo.language}</div>
          </div>
        )}
        {systemInfo.screen_resolution && (
          <div className="info-item">
            <div className="info-label">{t("systemInfo.screenResolution")}</div>
            <div className="info-value">{systemInfo.screen_resolution}</div>
          </div>
        )}
      </div>
      <button className="btn btn-primary" onClick={loadSystemInfo}>
        {t("systemInfo.refresh")}
      </button>
    </div>
  );
}

export default SystemInfo;
