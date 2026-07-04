/**
 * Controller / 控制器: bind dev toolbox state; 子 Tab 切换、开发工具、诊断、系统信息.
 */
import { useEffect, useState } from "react"
import { systemInfoUseCases } from "@/features/system-settings/services/system-info.use-cases"
import { systemSettingsUseCases } from "@/features/system-settings/services/system-settings.use-cases"
import { useSettingAction } from "@/features/system-settings/hooks/useSettingAction"
import { getErrorMessage } from "@/lib/tauri/errors"
import type { SystemInfoData } from "@/lib/tauri/types/system-info"

export type ToolboxTab =
  | "port-manager"
  | "dev-cleaner"
  | "env-detector"
  | "token-calc"
  | "devtools"
  | "diagnostics"
  | "info"

export function useDevToolboxController() {
  const { run, applying } = useSettingAction()

  // ── DevTools sub-tab state ──
  const [jsonInput, setJsonInput] = useState("")
  const [jsonOutput, setJsonOutput] = useState("")
  const [b64Input, setB64Input] = useState("")
  const [b64Output, setB64Output] = useState("")
  const [hashInput, setHashInput] = useState("")
  const [hashAlgo, setHashAlgo] = useState("sha256")
  const [hashOutput, setHashOutput] = useState("")
  const [tsInput, setTsInput] = useState("")
  const [tsFormat, setTsFormat] = useState("datetime")
  const [tsOutput, setTsOutput] = useState("")
  const [uuidOutput, setUuidOutput] = useState("")

  // ── Diagnostics sub-tab state ──
  const [diagnosticTarget, setDiagnosticTarget] = useState("")
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null)

  // ── Info sub-tab state ──
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null)
  const [systemInfoLoading, setSystemInfoLoading] = useState(false)
  const [systemInfoError, setSystemInfoError] = useState("")

  const [activeTab, setActiveTab] = useState<ToolboxTab>("port-manager")

  const runDiagnostic = async (action: () => Promise<unknown>) => {
    const result = await run("diagnostic.run", action)
    if (result !== undefined) {
      setDiagnosticResult(typeof result === "string" ? result : JSON.stringify(result, null, 2))
    }
  }

  // Lazy-load system info when info tab is selected
  useEffect(() => {
    if (activeTab !== "info" || systemInfo || systemInfoLoading) return
    setSystemInfoLoading(true)
    setSystemInfoError("")
    systemInfoUseCases
      .loadSystemInfo()
      .then(setSystemInfo)
      .catch((err) => setSystemInfoError(getErrorMessage(err, "Failed to load")))
      .finally(() => setSystemInfoLoading(false))
  }, [activeTab, systemInfo, systemInfoLoading])

  // ── DevTools handlers ──
  const handleJsonPretty = async () => {
    const r = await run("devtools.jsonPretty", () =>
      systemSettingsUseCases.jsonFormat(jsonInput, true),
    )
    if (r !== undefined) setJsonOutput(r)
  }

  const handleJsonMinify = async () => {
    const r = await run("devtools.jsonMinify", () =>
      systemSettingsUseCases.jsonFormat(jsonInput, false),
    )
    if (r !== undefined) setJsonOutput(r)
  }

  const handleBase64Encode = async () => {
    const r = await run("devtools.base64Encode", () =>
      systemSettingsUseCases.base64Encode(b64Input),
    )
    if (r !== undefined) setB64Output(r)
  }

  const handleBase64Decode = async () => {
    const r = await run("devtools.base64Decode", () =>
      systemSettingsUseCases.base64Decode(b64Input),
    )
    if (r !== undefined) setB64Output(r)
  }

  const handleHash = async () => {
    const r = await run("devtools.hash", () =>
      systemSettingsUseCases.calculateHash(hashInput, hashAlgo),
    )
    if (r !== undefined) setHashOutput(r)
  }

  const handleUuid = async () => {
    const r = await run("devtools.uuid", () => systemSettingsUseCases.generateUuid())
    if (r !== undefined) setUuidOutput(r)
  }

  const handleTimestamp = async () => {
    const r = await run("devtools.timestamp", () =>
      systemSettingsUseCases.timestampConvert(parseInt(tsInput) || 0, tsFormat),
    )
    if (r !== undefined) setTsOutput(r)
  }

  // ── Diagnostics handlers ──
  const handlePing = () => runDiagnostic(() => systemSettingsUseCases.pingHost(diagnosticTarget, 5))

  const handleLocalIp = async () => {
    const r = await run("diagnostics.localIp", () => systemSettingsUseCases.getLocalIp())
    if (r !== undefined) setDiagnosticResult(JSON.stringify(r, null, 2))
  }

  const handleWifiInfo = async () => {
    const r = await run("diagnostics.wifiInfo", () => systemSettingsUseCases.getWifiInfo())
    if (r !== undefined) setDiagnosticResult(JSON.stringify(r, null, 2))
  }

  return {
    // setting action
    applying,
    // active tab
    activeTab,
    setActiveTab,
    // devtools state
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
    // devtools handlers
    handleJsonPretty,
    handleJsonMinify,
    handleBase64Encode,
    handleBase64Decode,
    handleHash,
    handleUuid,
    handleTimestamp,
    // diagnostics state
    diagnosticTarget,
    setDiagnosticTarget,
    diagnosticResult,
    // diagnostics handlers
    handlePing,
    handleLocalIp,
    handleWifiInfo,
    // system info
    systemInfo,
    systemInfoLoading,
    systemInfoError,
  }
}

export type DevToolboxController = ReturnType<typeof useDevToolboxController>
