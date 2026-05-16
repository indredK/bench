import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@tauri-apps/api/core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMemory } from "@/lib/utils";

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

function SystemInfo({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [error, setError] = useState("");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (active && !fetchedRef.current) {
      fetchedRef.current = true;
      loadSystemInfo();
    }
  }, [active]);

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
    } else if (ua.includes("Edg")) {
      browserName = "Edge";
      const match = ua.match(/Edg\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes("Edge")) {
      browserName = "Edge";
      const match = ua.match(/Edge\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes("Chrome")) {
      browserName = "Chrome";
      const match = ua.match(/Chrome\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes("Safari")) {
      browserName = "Safari";
      const match = ua.match(/Version\/(\d+\.\d+)/);
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("systemInfo.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <div className="size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
            <p>{t("systemInfo.loading")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("systemInfo.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="default" onClick={loadSystemInfo}>{t("systemInfo.retry")}</Button>
        </CardContent>
      </Card>
    );
  }

  if (!systemInfo) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("systemInfo.title")}</CardTitle>
        <Button variant="outline" size="sm" onClick={loadSystemInfo}>
          {t("systemInfo.refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          <InfoItem label={t("systemInfo.osName")} value={systemInfo.os_name} />
          {systemInfo.os_version !== "Unknown" && (
            <InfoItem label={t("systemInfo.osVersion")} value={systemInfo.os_version} />
          )}
          {systemInfo.kernel_version !== "Unknown" && (
            <InfoItem label={t("systemInfo.kernelVersion")} value={systemInfo.kernel_version} />
          )}
          {systemInfo.hostname !== "Unknown" && (
            <InfoItem label={t("systemInfo.hostname")} value={systemInfo.hostname} />
          )}
          {systemInfo.cpu_brand !== "Unknown" && (
            <InfoItem label={t("systemInfo.cpuBrand")} value={systemInfo.cpu_brand} />
          )}
          {systemInfo.cpu_cores > 0 && (
            <InfoItem label={t("systemInfo.cpuCores")} value={String(systemInfo.cpu_cores)} />
          )}
          {systemInfo.total_memory > 0 && (
            <InfoItem label={t("systemInfo.totalMemory")} value={`${formatMemory(systemInfo.total_memory)} GB`} />
          )}
          {systemInfo.available_memory > 0 && (
            <InfoItem label={t("systemInfo.availableMemory")} value={`${formatMemory(systemInfo.available_memory)} GB`} />
          )}
          {systemInfo.used_memory > 0 && (
            <InfoItem label={t("systemInfo.usedMemory")} value={`${formatMemory(systemInfo.used_memory)} GB`} />
          )}
          {systemInfo.memory_usage_percent > 0 && (
            <InfoItem label={t("systemInfo.memoryUsage")} value={`${systemInfo.memory_usage_percent.toFixed(1)}%`} />
          )}
          {systemInfo.browser_name && (
            <InfoItem label={t("systemInfo.browserName")} value={systemInfo.browser_name} />
          )}
          {systemInfo.browser_version && (
            <InfoItem label={t("systemInfo.browserVersion")} value={systemInfo.browser_version} />
          )}
          {systemInfo.platform && (
            <InfoItem label={t("systemInfo.platform")} value={systemInfo.platform} />
          )}
          {systemInfo.language && (
            <InfoItem label={t("systemInfo.language")} value={systemInfo.language} />
          )}
          {systemInfo.screen_resolution && (
            <InfoItem label={t("systemInfo.screenResolution")} value={systemInfo.screen_resolution} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-4">
      <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  );
}

export default SystemInfo;