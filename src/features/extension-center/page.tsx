/**
 * Extension Center / 插件中心: 只管 Bench 插件的生命周期（安装 · 更新 · 启停 · 卸载 · 诊断）.
 *
 * 浏览器扩展 / MCP / 原生应用属于「跨端接入」模块，不在这里。
 */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, RefreshCw } from "lucide-react"

import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { PageBody, PageHeader, PageShell, PageTabs } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useExtensionCenterController } from "@/features/extension-center/hooks/useExtensionCenterController"
import { useMarketController } from "@/features/extension-center/hooks/useMarketController"
import { selectMetadata, useResolvedLocale } from "@/features/extension-center/lib/metadata"
import { findAvailableUpdates } from "@/features/extension-center/lib/versions"
import { DiagnosticsPanel } from "@/features/extension-center/components/DiagnosticsPanel"
import { InstallConfirmDialog } from "@/features/extension-center/components/InstallConfirmDialog"
import { InstalledPanel } from "@/features/extension-center/components/InstalledPanel"
import { MarketPanel } from "@/features/extension-center/components/MarketPanel"
import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"

type TabKey = "installed" | "market" | "diagnostics"

export default function ExtensionCenterPage() {
  const { t } = useTranslation()
  const locale = useResolvedLocale()
  const { items, loading, error, busyIds, refresh, open, toggleEnabled, uninstall } =
    useExtensionCenterController()
  const {
    marketListing,
    marketLoading,
    marketError,
    refreshMarket,
    prepareInstall,
    pendingPreview,
    committing,
    confirmInstall,
    cancelInstall,
  } = useMarketController()
  const [uninstallTarget, setUninstallTarget] = useState<ExtensionSummary | null>(null)
  const [tab, setTab] = useState<TabKey>("installed")

  // 进页面就静默拉一次市场目录：「已安装」里的可更新提示依赖它；失败只在「市场」标签展示。
  useEffect(() => {
    void refreshMarket()
  }, [refreshMarket])

  const updates = useMemo(() => findAvailableUpdates(marketListing), [marketListing])
  const updateCount = Object.keys(updates).filter((id) =>
    items.some((item) => item.id === id),
  ).length
  const installedVersions = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item.version])),
    [items],
  )

  const refreshing = tab === "market" ? marketLoading : loading
  const handleRefresh = () => {
    if (tab === "market") void refreshMarket()
    else {
      void refresh()
      void refreshMarket()
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={t("extensionCenter.title")}
        subtitle={t("extensionCenter.subtitle")}
        nav={
          <PageTabs
            ariaLabel={t("extensionCenter.title")}
            value={tab}
            onChange={setTab}
            items={[
              { id: "installed", label: t("extensionCenter.tabInstalled"), badge: updateCount },
              { id: "market", label: t("extensionCenter.tabMarket") },
              { id: "diagnostics", label: t("extensionCenter.tabDiagnostics") },
            ]}
          />
        }
        actions={
          tab === "diagnostics" ? null : (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {t("extensionCenter.refresh")}
            </Button>
          )
        }
      />

      <PageBody>
        {tab === "installed" && (
          <InstalledPanel
            items={items}
            loading={loading}
            error={error}
            busyIds={busyIds}
            updates={updates}
            updating={(id, version) => busyIds.includes(`${id}@${version}`)}
            onRefresh={() => void refresh()}
            onOpen={(id) => void open(id)}
            onToggleEnabled={(item) => void toggleEnabled(item)}
            onUpdate={(id, version) => void prepareInstall(id, version)}
            onUninstall={setUninstallTarget}
          />
        )}
        {tab === "market" && (
          <MarketPanel
            listing={marketListing}
            loading={marketLoading}
            error={marketError}
            busyIds={busyIds}
            installedVersions={installedVersions}
            onRefresh={() => void refreshMarket()}
            onInstall={(id, version) => void prepareInstall(id, version)}
          />
        )}
        {tab === "diagnostics" && <DiagnosticsPanel />}
      </PageBody>

      <InstallConfirmDialog
        preview={pendingPreview}
        committing={committing}
        onConfirm={() => void confirmInstall()}
        onCancel={cancelInstall}
      />

      <DestructiveConfirmDialog
        open={uninstallTarget !== null}
        onOpenChange={(openDialog) => {
          if (!openDialog) setUninstallTarget(null)
        }}
        title={t("extensionCenter.uninstallConfirmTitle")}
        description={
          uninstallTarget
            ? t("extensionCenter.uninstallConfirmDescription").replace(
                "{name}",
                selectMetadata(
                  locale,
                  { zh: uninstallTarget.displayZh, en: uninstallTarget.displayEn },
                  uninstallTarget.id,
                ),
              )
            : ""
        }
        confirmLabel={t("extensionCenter.uninstall")}
        cancelLabel={t("extensionCenter.cancel")}
        loading={uninstallTarget !== null && busyIds.includes(uninstallTarget.id)}
        onConfirm={async () => {
          if (uninstallTarget) await uninstall(uninstallTarget)
          setUninstallTarget(null)
        }}
      />
    </PageShell>
  )
}
