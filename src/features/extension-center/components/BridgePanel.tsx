/**
 * BridgePanel / 跨端接入面板.
 *
 * 浏览器扩展（bench-companion）导出 + Native Messaging 注册状态；
 * MCP 客户端探测与一键写入。二者共用本机 bench-host 二进制（能力出口）。
 */
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  exportBrowserExtension,
  getBrowserExtensionStatus,
  getMcpTargetsStatus,
  installMcpClients,
  openBrowserExtensionsPage,
} from "@/lib/tauri/commands/browser-ext"
import { parseCommandError } from "@/lib/tauri/errors"
import type {
  BrowserExtensionExport,
  BrowserExtensionStatus,
  McpTargetStatus,
} from "@/lib/tauri/types/browser-ext"

type CommandError = { code: string; message: string }

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 font-mono">{value}</code>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? t("extensionCenter.bridgeCopied") : t("extensionCenter.bridgeCopy")}
      </Button>
    </div>
  )
}

export function BridgePanel() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<BrowserExtensionStatus | null>(null)
  const [exportResult, setExportResult] = useState<BrowserExtensionExport | null>(null)
  const [mcpTargets, setMcpTargets] = useState<McpTargetStatus[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<CommandError | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([getBrowserExtensionStatus(), getMcpTargetsStatus()])
      setStatus(s)
      setMcpTargets(m)
      // 默认勾选「疑似已安装但未配置」的客户端
      setSelectedClients(m.filter((c) => c.installedHint && !c.benchConfigured).map((c) => c.id))
      setError(null)
    } catch (e) {
      setError(parseCommandError(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await exportBrowserExtension()
      setExportResult(result)
      await refresh()
      toast.success(
        result.extensionVersion
          ? t("extensionCenter.bridgeExportedVersion", { version: result.extensionVersion })
          : t("extensionCenter.bridgeExported"),
      )
    } catch (e) {
      const parsed = parseCommandError(e)
      setError(parsed)
      toast.error(parsed.message)
    } finally {
      setExporting(false)
    }
  }

  const handleInstall = async () => {
    if (selectedClients.length === 0) return
    setInstalling(true)
    try {
      const results = await installMcpClients(selectedClients)
      const failed = results.filter((r) => !r.installed)
      if (failed.length > 0) {
        toast.error(
          `${t("extensionCenter.bridgeMcpFailed")}: ${failed.map((f) => f.targetId).join(", ")}`,
        )
      } else {
        toast.success(t("extensionCenter.bridgeMcpDone"))
      }
      await refresh()
    } catch (e) {
      toast.error(parseCommandError(e).message)
    } finally {
      setInstalling(false)
    }
  }

  if (error && status === null) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{t("extensionCenter.bridgeStatusError")}</p>
        <p className="mt-1 font-mono text-xs opacity-80">
          [{error.code}] {error.message}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void refresh()}>
          {t("extensionCenter.retry")}
        </Button>
      </div>
    )
  }

  const shownDir = exportResult?.extensionDir ?? status?.extensionDir ?? ""
  const installedBrowsers = status?.browsers.filter((b) => b.installed) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t("extensionCenter.bridgeTitle")}</h2>
          <p className="text-muted-foreground text-xs">{t("extensionCenter.bridgeSubtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          {t("extensionCenter.bridgeRefresh")}
        </Button>
      </div>

      {status && !status.hostBinFound && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {t("extensionCenter.bridgeHostMissing")}
        </div>
      )}

      {/* —— 浏览器扩展 —— */}
      <section className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            {t("extensionCenter.bridgeExportBtn")}
            {(exportResult?.extensionVersion ?? status?.extensionVersion) && (
              <span
                className="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[11px]"
                title={t("extensionCenter.bridgeExtVersion")}
              >
                v{exportResult?.extensionVersion ?? status?.extensionVersion}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 text-xs ${
                status?.exported
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {status?.exported
                ? t("extensionCenter.bridgeExported")
                : t("extensionCenter.bridgeNotExported")}
            </span>
            <Button
              size="sm"
              disabled={exporting || (status !== null && !status.hostBinFound)}
              onClick={() => void handleExport()}
            >
              {exporting
                ? t("extensionCenter.bridgeExporting")
                : t("extensionCenter.bridgeExportBtn")}
            </Button>
          </div>
        </div>

        {shownDir && (
          <div className="mt-3 grid gap-1">
            <CopyRow label={t("extensionCenter.bridgeExtDir")} value={shownDir} />
            <CopyRow label={t("extensionCenter.bridgeExtId")} value={status?.extensionId ?? ""} />
          </div>
        )}

        {shownDir && (
          <div className="mt-3 rounded border border-dashed p-3">
            <p className="text-xs font-medium">{t("extensionCenter.bridgeStepsTitle")}</p>
            <ol className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
              {(["bridgeStep1", "bridgeStep2", "bridgeStep3", "bridgeStep4"] as const).map((k) => (
                <li key={k}>{t(`extensionCenter.${k}`)}</li>
              ))}
            </ol>
          </div>
        )}

        {installedBrowsers.length > 0 && (
          <div className="mt-3">
            <p className="text-muted-foreground text-xs">{t("extensionCenter.bridgeBrowsers")}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {installedBrowsers.map((b) => (
                <Button
                  key={b.id}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openBrowserExtensionsPage(b.id).catch((e) =>
                      toast.error(parseCommandError(e).message),
                    )
                  }}
                >
                  {b.name} · {t("extensionCenter.bridgeOpenExtensionsPage")}
                </Button>
              ))}
            </div>
          </div>
        )}

        {(exportResult ?? status) && (
          <div className="mt-3">
            <p className="text-muted-foreground text-xs">{t("extensionCenter.bridgeNmTitle")}</p>
            <div className="mt-1 grid gap-0.5">
              {(exportResult?.nmRegistrations ?? status?.nmRegistrations ?? []).map((r) => (
                <div key={r.browser} className="flex items-center gap-2 text-xs">
                  <span className={r.registered ? "text-green-600" : "text-muted-foreground"}>
                    {r.registered ? "●" : "○"}
                  </span>
                  <span className="w-16">{r.browser}</span>
                  <code className="text-muted-foreground truncate font-mono">{r.manifestPath}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* —— MCP —— */}
      <section className="rounded-lg border p-4">
        <h3 className="text-sm font-medium">{t("extensionCenter.bridgeMcpTitle")}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{t("extensionCenter.bridgeMcpHint")}</p>
        <div className="mt-2 grid gap-1">
          {mcpTargets.map((c) => (
            <label
              key={c.id}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={selectedClients.includes(c.id)}
                onChange={(e) => {
                  setSelectedClients((prev) =>
                    e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                  )
                }}
              />
              <span className="font-medium">{c.name}</span>
              {c.benchConfigured && (
                <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
                  {t("extensionCenter.bridgeMcpInstalled")}
                </span>
              )}
              <code className="text-muted-foreground truncate font-mono">{c.configPath}</code>
            </label>
          ))}
        </div>
        <Button
          size="sm"
          className="mt-3"
          disabled={installing || selectedClients.length === 0}
          onClick={() => void handleInstall()}
        >
          {installing ? t("extensionCenter.bridgeMcpWriting") : t("extensionCenter.bridgeMcpWrite")}
        </Button>
      </section>
    </div>
  )
}
