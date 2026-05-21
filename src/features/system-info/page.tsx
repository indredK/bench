/**
 * Page View / 页面视图: compose screen only; 只组合页面.
 */
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSystemInfoController } from "@/features/system-info/hooks/useSystemInfoController";
import { formatMemory, formatUptime } from "@/lib/utils";

function SystemInfo({ active }: { active: boolean }) {
  const { t, loading, systemInfo, error, loadSystemInfo } = useSystemInfoController(active);

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

  const uptimeStr = formatUptime(systemInfo.uptime_seconds);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("systemInfo.title")}</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={loadSystemInfo}>
            {t("systemInfo.refresh")}
          </Button>
        </CardAction>
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
          {systemInfo.model_name && (
            <InfoItem label={t("systemInfo.modelName")} value={systemInfo.model_name} />
          )}
          {systemInfo.cpu_brand !== "Unknown" && (
            <InfoItem label={t("systemInfo.cpuBrand")} value={systemInfo.cpu_brand} />
          )}
          {systemInfo.arch !== "Unknown" && systemInfo.arch && (
            <InfoItem label={t("systemInfo.arch")} value={systemInfo.arch} />
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
          {uptimeStr && (
            <InfoItem label={t("systemInfo.uptime")} value={uptimeStr} />
          )}
          {systemInfo.distribution && (
            <InfoItem label={t("systemInfo.distribution")} value={systemInfo.distribution} />
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
