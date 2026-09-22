/**
 * InfoPanel / 系统信息子面板: 懒加载的系统信息键值网格.
 *
 * 从 page.tsx 拆出（planned#9），只负责渲染，状态走传入的 controller。
 */
import { useTranslation } from "react-i18next"
import { Loader2Icon } from "lucide-react"
import { SettingGroup } from "@/components/ui/setting-group"
import { formatMemory, formatUptime } from "@/lib/utils"
import type { DevToolboxController } from "@/features/dev-toolbox/hooks/useDevToolboxController"

export function InfoPanel({ controller }: { controller: DevToolboxController }) {
  const { t } = useTranslation()
  const { systemInfo, systemInfoLoading, systemInfoError } = controller

  if (systemInfoLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2Icon className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (systemInfoError) {
    return (
      <SettingGroup title={t("systemInfo.title")}>
        <p className="text-destructive py-2 text-sm">{t(systemInfoError)}</p>
      </SettingGroup>
    )
  }
  if (!systemInfo) return null
  return (
    <SettingGroup
      title={t("systemInfo.title")}
      className="flex h-full flex-col"
      contentClassName="flex-1 min-h-0"
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {[
          { label: t("systemInfo.osName"), value: systemInfo.os_name },
          systemInfo.os_version !== "Unknown" && {
            label: t("systemInfo.osVersion"),
            value: systemInfo.os_version,
          },
          systemInfo.kernel_version !== "Unknown" && {
            label: t("systemInfo.kernelVersion"),
            value: systemInfo.kernel_version,
          },
          systemInfo.hostname !== "Unknown" && {
            label: t("systemInfo.hostname"),
            value: systemInfo.hostname,
          },
          systemInfo.model_name && {
            label: t("systemInfo.modelName"),
            value: systemInfo.model_name,
          },
          systemInfo.cpu_brand !== "Unknown" && {
            label: t("systemInfo.cpuBrand"),
            value: systemInfo.cpu_brand,
          },
          systemInfo.arch !== "Unknown" &&
            systemInfo.arch && {
              label: t("systemInfo.arch"),
              value: systemInfo.arch,
            },
          systemInfo.cpu_cores > 0 && {
            label: t("systemInfo.cpuCores"),
            value: String(systemInfo.cpu_cores),
          },
          systemInfo.total_memory > 0 && {
            label: t("systemInfo.totalMemory"),
            value: `${formatMemory(systemInfo.total_memory)} GB`,
          },
          systemInfo.available_memory > 0 && {
            label: t("systemInfo.availableMemory"),
            value: `${formatMemory(systemInfo.available_memory)} GB`,
          },
          systemInfo.used_memory > 0 && {
            label: t("systemInfo.usedMemory"),
            value: `${formatMemory(systemInfo.used_memory)} GB`,
          },
          systemInfo.memory_usage_percent > 0 && {
            label: t("systemInfo.memoryUsage"),
            value: `${systemInfo.memory_usage_percent.toFixed(1)}%`,
          },
          formatUptime(systemInfo.uptime_seconds) && {
            label: t("systemInfo.uptime"),
            value: formatUptime(systemInfo.uptime_seconds)!,
          },
          systemInfo.distribution && {
            label: t("systemInfo.distribution"),
            value: systemInfo.distribution,
          },
          systemInfo.browser_name && {
            label: t("systemInfo.browserName"),
            value: systemInfo.browser_name,
          },
          systemInfo.browser_version && {
            label: t("systemInfo.browserVersion"),
            value: systemInfo.browser_version,
          },
          systemInfo.platform && { label: t("systemInfo.platform"), value: systemInfo.platform },
          systemInfo.language && { label: t("systemInfo.language"), value: systemInfo.language },
          systemInfo.screen_resolution && {
            label: t("systemInfo.screenResolution"),
            value: systemInfo.screen_resolution,
          },
        ]
          .filter((item): item is { label: string; value: string } => Boolean(item))
          .map((item) => (
            <div key={item.label} className="bg-muted/40 rounded-lg border px-4 py-4">
              <div className="text-muted-foreground mb-1.5 text-xs font-semibold">{item.label}</div>
              <div className="text-sm font-medium break-words">{item.value}</div>
            </div>
          ))}
      </div>
    </SettingGroup>
  )
}
