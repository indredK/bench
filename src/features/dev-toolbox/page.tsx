/**
 * Dev Toolbox Page / 开发工具箱: 统一入口，7 个子 Tab。
 *
 * 收容: 端口管理 / 开发清理 / 环境检测 / Token 计算 / 开发工具 / 网络诊断 / 系统信息
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon, Code, Network, Monitor, Zap, Trash2, Box, Coins } from "lucide-react";
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases";
import { systemInfoUseCases } from "@/features/system-settings/services/system-info.use-cases";
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction";
import { SettingGroup } from "@/components/ui/setting-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/tauri/errors";
import type { AppFeature } from "@/features/types";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";
import { formatMemory, formatUptime } from "@/lib/utils";

const PortManager = lazy(() => import("@/features/port-manager/page"));
const DevCleaner = lazy(() => import("@/features/dev-cleaner/page"));
const EnvDetector = lazy(() => import("@/features/env-detector/page"));
const TokenCalculatorPage = lazy(() => import("@/features/token-calculator/page"));

type ToolboxTab = "port-manager" | "dev-cleaner" | "env-detector" | "token-calc" | "devtools" | "diagnostics" | "info";

interface DevToolboxProps { feature: AppFeature; }

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-32">
      <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function DevToolbox({ feature }: DevToolboxProps) {
  const { t } = useTranslation();
  const { run, applying } = useSettingAction();

  // ── DevTools sub-tab state ──
  const [jsonInput, setJsonInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [b64Input, setB64Input] = useState("");
  const [b64Output, setB64Output] = useState("");
  const [hashInput, setHashInput] = useState("");
  const [hashAlgo, setHashAlgo] = useState("sha256");
  const [hashOutput, setHashOutput] = useState("");
  const [tsInput, setTsInput] = useState("");
  const [tsFormat, setTsFormat] = useState("datetime");
  const [tsOutput, setTsOutput] = useState("");
  const [uuidOutput, setUuidOutput] = useState("");

  // ── Diagnostics sub-tab state ──
  const [diagnosticTarget, setDiagnosticTarget] = useState("");
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  // ── Info sub-tab state ──
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(false);
  const [systemInfoError, setSystemInfoError] = useState("");

  const [activeTab, setActiveTab] = useState<ToolboxTab>("port-manager");

  const runDiagnostic = async (action: () => Promise<unknown>) => {
    const result = await run("diagnostic.run", action);
    if (result !== undefined) setDiagnosticResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  };

  // Lazy-load system info when info tab is selected
  useEffect(() => {
    if (activeTab === "info" && !systemInfo && !systemInfoLoading) {
      setSystemInfoLoading(true);
      setSystemInfoError("");
      systemInfoUseCases.loadSystemInfo()
        .then(setSystemInfo)
        .catch((err) => setSystemInfoError(getErrorMessage(err, "Failed to load")))
        .finally(() => setSystemInfoLoading(false));
    }
  }, [activeTab]);

  // ── Sub-tab content renderers ──

  const renderDevtools = () => (
    <div className="space-y-4">
      <SettingGroup title={t("systemSettings.devtools.jsonTitle")}>
        <div className="space-y-2 py-2">
          <textarea className="w-full h-24 text-xs font-mono bg-muted rounded p-2" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} placeholder={t("systemSettings.devtools.jsonPlaceholder")} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.jsonPretty", () => systemSettingsUseCases.jsonFormat(jsonInput, true)); if (r !== undefined) setJsonOutput(r); }}>{t("systemSettings.devtools.prettyPrint")}</Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.jsonMinify", () => systemSettingsUseCases.jsonFormat(jsonInput, false)); if (r !== undefined) setJsonOutput(r); }}>{t("systemSettings.devtools.minify")}</Button>
          </div>
          {jsonOutput && <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">{jsonOutput}</pre>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.base64Title")}>
        <div className="space-y-2 py-2">
          <Input value={b64Input} onChange={(e) => setB64Input(e.target.value)} placeholder={t("systemSettings.devtools.base64Placeholder")} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.base64Encode", () => systemSettingsUseCases.base64Encode(b64Input)); if (r !== undefined) setB64Output(r); }}>{t("systemSettings.devtools.encode")}</Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.base64Decode", () => systemSettingsUseCases.base64Decode(b64Input)); if (r !== undefined) setB64Output(r); }}>{t("systemSettings.devtools.decode")}</Button>
          </div>
          {b64Output && <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-24">{b64Output}</pre>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.hashTitle")}>
        <div className="space-y-2 py-2">
          <Input value={hashInput} onChange={(e) => setHashInput(e.target.value)} placeholder={t("systemSettings.devtools.hashPlaceholder")} />
          <div className="flex gap-2 items-center">
            <select value={hashAlgo} onChange={(e) => setHashAlgo(e.target.value)} className="text-xs border rounded px-2 py-1">
              <option value="md5">MD5</option><option value="sha1">SHA1</option><option value="sha256">SHA256</option><option value="sha384">SHA384</option><option value="sha512">SHA512</option>
            </select>
            <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.hash", () => systemSettingsUseCases.calculateHash(hashInput, hashAlgo)); if (r !== undefined) setHashOutput(r); }}>{t("systemSettings.devtools.calculate")}</Button>
          </div>
          {hashOutput && <pre className="text-xs bg-muted p-2 rounded overflow-auto">{hashOutput}</pre>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.uuidTitle")}>
        <div className="flex gap-2 py-2">
          <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.uuid", () => systemSettingsUseCases.generateUuid()); if (r !== undefined) setUuidOutput(r); }}>{t("systemSettings.devtools.generateUuid")}</Button>
          {uuidOutput && <code className="text-xs bg-muted px-2 py-1 rounded">{uuidOutput}</code>}
        </div>
      </SettingGroup>
      <SettingGroup title={t("systemSettings.devtools.timestampTitle")}>
        <div className="space-y-2 py-2">
          <Input value={tsInput} onChange={(e) => setTsInput(e.target.value)} placeholder={t("systemSettings.devtools.timestampPlaceholder")} />
          <div className="flex gap-2 items-center">
            <select value={tsFormat} onChange={(e) => setTsFormat(e.target.value)} className="text-xs border rounded px-2 py-1">
              <option value="datetime">{t("systemSettings.devtools.formatFullDateTime")}</option>
              <option value="date">{t("systemSettings.devtools.formatDateOnly")}</option>
              <option value="time">{t("systemSettings.devtools.formatTimeOnly")}</option>
              <option value="iso">{t("systemSettings.devtools.formatIso")}</option>
            </select>
            <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("devtools.timestamp", () => systemSettingsUseCases.timestampConvert(parseInt(tsInput) || 0, tsFormat)); if (r !== undefined) setTsOutput(r); }}>{t("systemSettings.devtools.convert")}</Button>
          </div>
          {tsOutput && <pre className="text-xs bg-muted p-2 rounded overflow-auto">{tsOutput}</pre>}
        </div>
      </SettingGroup>
    </div>
  );

  const renderDiagnostics = () => (
    <div className="space-y-4">
      <SettingGroup title={t("systemSettings.diagnostics.title")}>
        <p className="text-xs text-muted-foreground py-2">{t("systemSettings.diagnostics.description")}</p>
        <div className="flex gap-2 py-2">
          <Input value={diagnosticTarget} onChange={(e) => setDiagnosticTarget(e.target.value)} placeholder={t("systemSettings.diagnostics.targetPlaceholder")} className="flex-1" />
        </div>
        <div className="flex flex-wrap gap-2 py-2">
          <Button variant="outline" size="sm" disabled={applying} onClick={() => runDiagnostic(() => systemSettingsUseCases.pingHost(diagnosticTarget, 5))}>{t("systemSettings.diagnostics.ping")}</Button>
          <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("diagnostics.localIp", () => systemSettingsUseCases.getLocalIp()); if (r !== undefined) setDiagnosticResult(JSON.stringify(r, null, 2)); }}>{t("systemSettings.diagnostics.localIp")}</Button>
          <Button variant="outline" size="sm" disabled={applying} onClick={async () => { const r = await run("diagnostics.wifiInfo", () => systemSettingsUseCases.getWifiInfo()); if (r !== undefined) setDiagnosticResult(JSON.stringify(r, null, 2)); }}>{t("systemSettings.diagnostics.wifi")}</Button>
        </div>
        {diagnosticResult && <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">{diagnosticResult}</pre>}
      </SettingGroup>
    </div>
  );

  const renderInfo = () => {
    if (systemInfoLoading) {
      return <div className="flex items-center justify-center h-32"><Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
    }
    if (systemInfoError) {
      return <SettingGroup title={t("systemInfo.title")}><p className="text-sm text-destructive py-2">{systemInfoError}</p></SettingGroup>;
    }
    if (!systemInfo) return null;
    return (
      <SettingGroup title={t("systemInfo.title")}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {[
            { label: t("systemInfo.osName"), value: systemInfo.os_name },
            systemInfo.os_version !== "Unknown" && { label: t("systemInfo.osVersion"), value: systemInfo.os_version },
            systemInfo.kernel_version !== "Unknown" && { label: t("systemInfo.kernelVersion"), value: systemInfo.kernel_version },
            systemInfo.hostname !== "Unknown" && { label: t("systemInfo.hostname"), value: systemInfo.hostname },
            systemInfo.model_name && { label: t("systemInfo.modelName"), value: systemInfo.model_name },
            systemInfo.cpu_brand !== "Unknown" && { label: t("systemInfo.cpuBrand"), value: systemInfo.cpu_brand },
            systemInfo.arch !== "Unknown" && systemInfo.arch && { label: t("systemInfo.arch"), value: systemInfo.arch },
            systemInfo.cpu_cores > 0 && { label: t("systemInfo.cpuCores"), value: String(systemInfo.cpu_cores) },
            systemInfo.total_memory > 0 && { label: t("systemInfo.totalMemory"), value: `${formatMemory(systemInfo.total_memory)} GB` },
            systemInfo.available_memory > 0 && { label: t("systemInfo.availableMemory"), value: `${formatMemory(systemInfo.available_memory)} GB` },
            systemInfo.used_memory > 0 && { label: t("systemInfo.usedMemory"), value: `${formatMemory(systemInfo.used_memory)} GB` },
            systemInfo.memory_usage_percent > 0 && { label: t("systemInfo.memoryUsage"), value: `${systemInfo.memory_usage_percent.toFixed(1)}%` },
            formatUptime(systemInfo.uptime_seconds) && { label: t("systemInfo.uptime"), value: formatUptime(systemInfo.uptime_seconds)! },
            systemInfo.distribution && { label: t("systemInfo.distribution"), value: systemInfo.distribution },
            systemInfo.browser_name && { label: t("systemInfo.browserName"), value: systemInfo.browser_name },
            systemInfo.browser_version && { label: t("systemInfo.browserVersion"), value: systemInfo.browser_version },
            systemInfo.platform && { label: t("systemInfo.platform"), value: systemInfo.platform },
            systemInfo.language && { label: t("systemInfo.language"), value: systemInfo.language },
            systemInfo.screen_resolution && { label: t("systemInfo.screenResolution"), value: systemInfo.screen_resolution },
          ].filter((item): item is { label: string; value: string } => Boolean(item)).map((item) => (
            <div key={item.label} className="rounded-lg border bg-muted/40 px-4 py-4">
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{item.label}</div>
              <div className="text-sm font-medium break-words">{item.value}</div>
            </div>
          ))}
        </div>
      </SettingGroup>
    );
  };

  // ── Rendering the active full-page tool ──
  // For port-manager, dev-cleaner, env-detector, token-calc: render their page component directly.
  // These components use their own controllers/hooks and work independently.
  const renderFullPageTool = () => {
    switch (activeTab) {
      case "port-manager":
        return <Suspense fallback={<PageFallback />}><PortManager feature={feature} /></Suspense>;
      case "dev-cleaner":
        return <Suspense fallback={<PageFallback />}><DevCleaner feature={feature} /></Suspense>;
      case "env-detector":
        return <Suspense fallback={<PageFallback />}><EnvDetector active feature={feature} /></Suspense>;
      case "token-calc":
        return <Suspense fallback={<PageFallback />}><TokenCalculatorPage /></Suspense>;
      case "devtools":
        return renderDevtools();
      case "diagnostics":
        return renderDiagnostics();
      case "info":
        return renderInfo();
      default:
        return null;
    }
  };

  const tabs: { id: ToolboxTab; labelKey: string; icon: typeof Zap }[] = [
    { id: "port-manager", labelKey: "sidebar.portManager", icon: Zap },
    { id: "dev-cleaner", labelKey: "sidebar.devCleaner", icon: Trash2 },
    { id: "env-detector", labelKey: "sidebar.envDetector", icon: Box },
    { id: "token-calc", labelKey: "sidebar.tokenCalculator", icon: Coins },
    { id: "devtools", labelKey: "devToolbox.devtools", icon: Code },
    { id: "diagnostics", labelKey: "devToolbox.diagnostics", icon: Network },
    { id: "info", labelKey: "devToolbox.info", icon: Monitor },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 flex gap-1 shrink-0 overflow-x-auto">
        {tabs.map(({ id, labelKey, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={cn(
              "px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-[1px] flex items-center gap-1.5 whitespace-nowrap",
              activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <Icon size={13} /> {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {renderFullPageTool()}
      </div>
    </div>
  );
}
