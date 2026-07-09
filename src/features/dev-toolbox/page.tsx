/**
 * Dev Toolbox Page / 开发工具箱: 统一入口，6 个子 Tab。
 *
 * 收容: 端口管理 / 环境检测 / Token 计算 / 开发工具 / 网络诊断 / 系统信息
 */
import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Loader2Icon, Code, Network, Monitor, Zap, Box, Coins } from "lucide-react"
import { SettingGroup } from "@/components/ui/setting-group"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AppFeature } from "@/features/types"
import { formatMemory, formatUptime } from "@/lib/utils"
import {
  useDevToolboxController,
  type ToolboxTab,
} from "@/features/dev-toolbox/hooks/useDevToolboxController"

const PortManager = lazy(() => import("@/features/port-manager/page"))
const EnvDetector = lazy(() => import("@/features/env-detector/page"))
const TokenCalculatorPage = lazy(() => import("@/features/token-calculator/page"))

interface DevToolboxProps {
  feature: AppFeature
}

function PageFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2Icon className="text-muted-foreground h-5 w-5 animate-spin" />
    </div>
  )
}

export default function DevToolbox({ feature }: DevToolboxProps) {
  const { t } = useTranslation()
  const {
    applying,
    activeTab,
    setActiveTab,
    jsonInput,
    setJsonInput,
    jsonOutput,
    b64Input,
    setB64Input,
    b64Output,
    hashInput,
    setHashInput,
    hashAlgo,
    setHashAlgo,
    hashOutput,
    tsInput,
    setTsInput,
    tsFormat,
    setTsFormat,
    tsOutput,
    uuidOutput,
    handleJsonPretty,
    handleJsonMinify,
    handleBase64Encode,
    handleBase64Decode,
    handleHash,
    handleUuid,
    handleTimestamp,
    diagnosticTarget,
    setDiagnosticTarget,
    diagnosticResult,
    handlePing,
    handleLocalIp,
    handleWifiInfo,
    systemInfo,
    systemInfoLoading,
    systemInfoError,
  } = useDevToolboxController()

  // ── Sub-tab content renderers ──

  const renderDevtools = () => (
    <div className="space-y-4">
      <SettingGroup title={t("systemSettings.devtools.jsonTitle")}>
        <div className="space-y-2 py-2">
          <Textarea
            className="bg-muted h-24 font-mono text-xs"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={t("systemSettings.devtools.jsonPlaceholder")}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={applying} onClick={handleJsonPretty}>
              {t("systemSettings.devtools.prettyPrint")}
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleJsonMinify}>
              {t("systemSettings.devtools.minify")}
            </Button>
          </div>
          {jsonOutput && (
            <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">{jsonOutput}</pre>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.base64Title")}>
        <div className="space-y-2 py-2">
          <Input
            value={b64Input}
            onChange={(e) => setB64Input(e.target.value)}
            placeholder={t("systemSettings.devtools.base64Placeholder")}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={applying} onClick={handleBase64Encode}>
              {t("systemSettings.devtools.encode")}
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleBase64Decode}>
              {t("systemSettings.devtools.decode")}
            </Button>
          </div>
          {b64Output && (
            <pre className="bg-muted max-h-24 overflow-auto rounded p-2 text-xs">{b64Output}</pre>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.hashTitle")}>
        <div className="space-y-2 py-2">
          <Input
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            placeholder={t("systemSettings.devtools.hashPlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Select value={hashAlgo} onValueChange={setHashAlgo}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="md5">MD5</SelectItem>
                <SelectItem value="sha1">SHA1</SelectItem>
                <SelectItem value="sha256">SHA256</SelectItem>
                <SelectItem value="sha384">SHA384</SelectItem>
                <SelectItem value="sha512">SHA512</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleHash}>
              {t("systemSettings.devtools.calculate")}
            </Button>
          </div>
          {hashOutput && (
            <pre className="bg-muted overflow-auto rounded p-2 text-xs">{hashOutput}</pre>
          )}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.uuidTitle")}>
        <div className="flex gap-2 py-2">
          <Button variant="outline" size="sm" disabled={applying} onClick={handleUuid}>
            {t("systemSettings.devtools.generateUuid")}
          </Button>
          {uuidOutput && <code className="bg-muted rounded px-2 py-1 text-xs">{uuidOutput}</code>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.timestampTitle")}>
        <div className="space-y-2 py-2">
          <Input
            value={tsInput}
            onChange={(e) => setTsInput(e.target.value)}
            placeholder={t("systemSettings.devtools.timestampPlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Select value={tsFormat} onValueChange={setTsFormat}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="datetime">{t("systemSettings.devtools.formatFullDateTime")}</SelectItem>
                <SelectItem value="date">{t("systemSettings.devtools.formatDateOnly")}</SelectItem>
                <SelectItem value="time">{t("systemSettings.devtools.formatTimeOnly")}</SelectItem>
                <SelectItem value="iso">{t("systemSettings.devtools.formatIso")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={applying} onClick={handleTimestamp}>
              {t("systemSettings.devtools.convert")}
            </Button>
          </div>
          {tsOutput && <pre className="bg-muted overflow-auto rounded p-2 text-xs">{tsOutput}</pre>}
        </div>
      </SettingGroup>
    </div>
  )

  const renderDiagnostics = () => (
    <div className="space-y-4">
      <SettingGroup title={t("systemSettings.diagnostics.title")}>
        <p className="text-muted-foreground py-2 text-xs">
          {t("systemSettings.diagnostics.description")}
        </p>
        <div className="flex gap-2 py-2">
          <Input
            value={diagnosticTarget}
            onChange={(e) => setDiagnosticTarget(e.target.value)}
            placeholder={t("systemSettings.diagnostics.targetPlaceholder")}
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2 py-2">
          <Button variant="outline" size="sm" disabled={applying} onClick={handlePing}>
            {t("systemSettings.diagnostics.ping")}
          </Button>
          <Button variant="outline" size="sm" disabled={applying} onClick={handleLocalIp}>
            {t("systemSettings.diagnostics.localIp")}
          </Button>
          <Button variant="outline" size="sm" disabled={applying} onClick={handleWifiInfo}>
            {t("systemSettings.diagnostics.wifi")}
          </Button>
        </div>
        {diagnosticResult && (
          <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-xs">
            {diagnosticResult}
          </pre>
        )}
      </SettingGroup>
    </div>
  )

  const renderInfo = () => {
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
      <SettingGroup title={t("systemInfo.title")}>
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
              systemInfo.arch && { label: t("systemInfo.arch"), value: systemInfo.arch },
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
                <div className="text-muted-foreground mb-1.5 text-xs font-semibold">
                  {item.label}
                </div>
                <div className="text-sm font-medium break-words">{item.value}</div>
              </div>
            ))}
        </div>
      </SettingGroup>
    )
  }

  // ── Rendering the active full-page tool ──
  // For port-manager, dev-cleaner, env-detector, token-calc: render their page component directly.
  // These components use their own controllers/hooks and work independently.
  const renderFullPageTool = () => {
    switch (activeTab) {
      case "port-manager":
        return (
          <Suspense fallback={<PageFallback />}>
            <PortManager feature={feature} />
          </Suspense>
        )
      case "env-detector":
        return (
          <Suspense fallback={<PageFallback />}>
            <EnvDetector active feature={feature} />
          </Suspense>
        )
      case "token-calc":
        return (
          <Suspense fallback={<PageFallback />}>
            <TokenCalculatorPage />
          </Suspense>
        )
      case "devtools":
        return renderDevtools()
      case "diagnostics":
        return renderDiagnostics()
      case "info":
        return renderInfo()
      default:
        return null
    }
  }

  const tabs: { id: ToolboxTab; labelKey: string; icon: typeof Zap }[] = [
    { id: "port-manager", labelKey: "sidebar.portManager", icon: Zap },
    { id: "env-detector", labelKey: "sidebar.envDetector", icon: Box },
    { id: "token-calc", labelKey: "sidebar.tokenCalculator", icon: Coins },
    { id: "devtools", labelKey: "devToolbox.devtools", icon: Code },
    { id: "diagnostics", labelKey: "devToolbox.diagnostics", icon: Network },
    { id: "info", labelKey: "devToolbox.info", icon: Monitor },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-4">
        {tabs.map(({ id, labelKey, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            onClick={() => setActiveTab(id)}
            className={cn(
              "-mb-[1px] flex items-center gap-1.5 rounded-none border-b-2 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              activeTab === id
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
            )}
          >
            <Icon size={13} /> {t(labelKey)}
          </Button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">{renderFullPageTool()}</div>
    </div>
  )
}
