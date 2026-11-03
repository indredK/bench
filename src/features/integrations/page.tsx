/**
 * Integrations / 跨端接入: Bench 与「桌面应用之外」的连接.
 *
 * 浏览器扩展（bench-companion）、AI 客户端（MCP）、自用原生应用。
 * 三者都不是 Bench 插件：不走插件市场、不沙箱、不随 registry 发布。
 */
import { useTranslation } from "react-i18next"
import { Loader2, RefreshCw } from "lucide-react"

import { PageBody, PageHeader, PageShell } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { BrowserExtensionSection } from "@/features/integrations/components/BrowserExtensionSection"
import { McpSection } from "@/features/integrations/components/McpSection"
import { NativeAppsSection } from "@/features/integrations/components/NativeAppsSection"
import { useBridgeController } from "@/features/integrations/hooks/useBridgeController"
import { useNativeAppsController } from "@/features/integrations/hooks/useNativeAppsController"

export default function IntegrationsPage() {
  const { t } = useTranslation()
  const bridge = useBridgeController()
  const nativeApps = useNativeAppsController()
  const refreshing = bridge.loading || nativeApps.loading

  return (
    <PageShell>
      <PageHeader
        title={t("integrations.title")}
        subtitle={t("integrations.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              void bridge.refresh()
              void nativeApps.refresh()
            }}
          >
            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t("integrations.refresh")}
          </Button>
        }
      />
      <PageBody>
        {bridge.error && bridge.status === null ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>{t("integrations.statusError")}</p>
            <p className="mt-1 font-mono text-xs break-all opacity-80">
              [{bridge.error.code}] {bridge.error.message}
            </p>
          </div>
        ) : null}
        {bridge.status && !bridge.status.hostBinFound ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {t("integrations.hostMissing")}
          </div>
        ) : null}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <BrowserExtensionSection
            status={bridge.status}
            exportResult={bridge.exportResult}
            exporting={bridge.exporting}
            onExport={() => void bridge.exportExtension()}
            onOpenExtensionsPage={(id) => void bridge.openExtensionsPage(id)}
          />
          <div className="flex min-w-0 flex-col gap-3">
            <McpSection
              targets={bridge.mcpTargets}
              selected={bridge.selectedClients}
              installing={bridge.installing}
              onToggle={bridge.toggleClient}
              onWrite={() => void bridge.writeMcp()}
            />
            <NativeAppsSection
              apps={nativeApps.apps}
              loading={nativeApps.loading}
              error={nativeApps.error}
              busyIds={nativeApps.busyIds}
              refresh={() => void nativeApps.refresh()}
              runAction={(appId, action) => nativeApps.runAction(appId, action)}
            />
          </div>
        </div>
      </PageBody>
    </PageShell>
  )
}
