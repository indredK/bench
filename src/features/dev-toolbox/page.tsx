/**
 * Dev Toolbox Page / 开发工具箱: 统一入口，6 个子 Tab。
 *
 * 收容: 端口管理 / 环境检测 / 开发工具 / 网络诊断 / 系统信息
 */
import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Loader2Icon, Code, Network, Monitor, Zap, Box } from "lucide-react"
import { SettingGroup } from "@/components/ui/setting-group"
import { ScrollableArea } from "@/components/common/ScrollableArea"
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
import { envDetectorFeature } from "@/features/env-detector/feature"
import { portManagerFeature } from "@/features/port-manager/feature"
import type { AppFeature } from "@/features/types"
import { formatMemory, formatUptime } from "@/lib/utils"
import {
  useDevToolboxController,
  type ToolboxTab,
} from "@/features/dev-toolbox/hooks/useDevToolboxController"

const PortManager = lazy(() => import("@/features/port-manager/page"))
const EnvDetector = lazy(() => import("@/features/env-detector/page"))

// Full-page tools own their internal scroll (h-full + nested ScrollableArea).
// Mounting them inside the outer ScrollableArea creates a fragile double h-full
// height chain (outer scroll tag is NOT a flex container, inner uses h-full),
// which collapses and breaks scrolling. Give them a plain flex-1 min-h-0 box
// instead — same height context they get as a standalone route (motion.div.h-full).
const FULL_PAGE_TOOL_TABS = new Set<ToolboxTab>(["port-manager", "env-detector"])

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

/**
 * 路由仍然传入工具箱自己的 descriptor，但这里不再往下传：门控条件属于各子功能
 * （端口管理/环境检测都是 desktopOnly:true），传工具箱的会把子页面的「仅桌面」占位吃掉。
 */
export default function DevToolbox(_props: DevToolboxProps) {
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
    regexPattern,
    setRegexPattern,
    regexFlags,
    setRegexFlags,
    regexInput,
    setRegexInput,
    regexReplacement,
    setRegexReplacement,
    regexResult,
    handleJsonPretty,
    handleJsonMinify,
    handleBase64Encode,
    handleBase64Decode,
    handleHash,
    handleUuid,
    handleTimestamp,
    handleRegexTest,
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
                <SelectItem value="datetime">
                  {t("systemSettings.devtools.formatFullDateTime")}
                </SelectItem>
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
      <SettingGroup title={t("systemSettings.devtools.regexTitle")}>
        <div className="space-y-2 py-2">
          <div className="flex gap-2">
            <Input
              className="min-w-0 flex-1 font-mono text-xs"
              value={regexPattern}
              onChange={(e) => setRegexPattern(e.target.value)}
              placeholder={t("systemSettings.devtools.regexPatternPlaceholder")}
            />
            <Input
              className="w-24 shrink-0 font-mono text-xs"
              value={regexFlags}
              onChange={(e) => setRegexFlags(e.target.value)}
              placeholder={t("systemSettings.devtools.regexFlagsPlaceholder")}
              aria-label={t("systemSettings.devtools.regexFlagsLabel")}
            />
          </div>
          <Textarea
            className="bg-muted h-20 font-mono text-xs"
            value={regexInput}
            onChange={(e) => setRegexInput(e.target.value)}
            placeholder={t("systemSettings.devtools.regexInputPlaceholder")}
          />
          <Input
            className="font-mono text-xs"
            value={regexReplacement}
            onChange={(e) => setRegexReplacement(e.target.value)}
            placeholder={t("systemSettings.devtools.regexReplacePlaceholder")}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRegexTest}>
              {t("systemSettings.devtools.regexTest")}
            </Button>
          </div>
          {regexResult && !regexResult.ok && (
            <div className="text-destructive border-destructive/40 bg-destructive/10 rounded border p-2 text-xs">
              {t("systemSettings.devtools.regexInvalidPattern")}: {regexResult.error}
            </div>
          )}
          {regexResult && regexResult.ok && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                {regexResult.total === 0
                  ? t("systemSettings.devtools.regexNoMatch")
                  : t("systemSettings.devtools.regexMatchCount", { total: regexResult.total })}
                {regexResult.truncated
                  ? ` · ${t("systemSettings.devtools.regexTruncated", { max: regexResult.total })}`
                  : ""}
              </p>
              {regexResult.matches.length > 0 && (
                <ul className="bg-muted max-h-48 space-y-1 overflow-auto rounded p-2 text-xs">
                  {regexResult.matches.map((m, i) => (
                    <li key={`${m.index}-${i}`} className="font-mono break-all">
                      <span className="text-muted-foreground">
                        {i + 1}. {t("systemSettings.devtools.regexIndexLabel", { index: m.index })}
                      </span>{" "}
                      <span className="font-semibold">{m.value}</span>
                      {m.groups.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          (
                          {m.groups
                            .map((g) => `${g.name ? `${g.name}:` : ""}${g.value ?? ""}`)
                            .join(", ")}
                          )
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {regexResult.replaced !== null && (
                <pre className="bg-muted max-h-32 overflow-auto rounded p-2 text-xs">
                  {regexResult.replaced}
                </pre>
              )}
            </div>
          )}
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
  // For port-manager, env-detector: render their page component directly.
  // These components use their own controllers/hooks and work independently.
  const renderFullPageTool = () => {
    switch (activeTab) {
      case "port-manager":
        return (
          <Suspense fallback={<PageFallback />}>
            {/* 门控条件属于子功能自己：传工具箱的 descriptor（desktopOnly:false）
                会让子页面在非桌面环境下不再显示「仅桌面功能」占位。 */}
            <PortManager feature={portManagerFeature} />
          </Suspense>
        )
      case "env-detector":
        return (
          <Suspense fallback={<PageFallback />}>
            <EnvDetector active feature={envDetectorFeature} />
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
      {FULL_PAGE_TOOL_TABS.has(activeTab) ? (
        <div className="min-h-0 flex-1">{renderFullPageTool()}</div>
      ) : (
        <ScrollableArea className="flex-1 p-4" wrapperClassName="flex flex-1 min-h-0">
          {renderFullPageTool()}
        </ScrollableArea>
      )}
    </div>
  )
}
