import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { useExtensionCenterController } from "@/features/extension-center/hooks/useExtensionCenterController"
import { useMarketController } from "@/features/extension-center/hooks/useMarketController"
import { BridgePanel } from "@/features/extension-center/components/BridgePanel"
import { DiagnosticsPanel } from "@/features/extension-center/components/DiagnosticsPanel"
import { InstallConfirmDialog } from "@/features/extension-center/components/InstallConfirmDialog"
import { MarketPanel } from "@/features/extension-center/components/MarketPanel"
import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"

type TabKey = "installed" | "market" | "diagnostics" | "bridge"

function StatusBadge({ enabled, t }: { enabled: boolean; t: (key: string) => string }) {
  const cls = enabled
    ? "bg-green-50 text-green-700 border border-green-200"
    : "bg-amber-50 text-amber-700 border border-amber-200"
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {enabled ? t("extensionCenter.enabled") : t("extensionCenter.disabled")}
    </span>
  )
}

function DistributionBadge({
  distribution,
  t,
}: {
  distribution: ExtensionSummary["distribution"]
  t: (key: string) => string
}) {
  const text =
    distribution === "bundled"
      ? t("extensionCenter.distribution.bundled")
      : t("extensionCenter.distribution.market")
  return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{text}</span>
}

function InstalledPanel({
  t,
  items,
  loading,
  error,
  busyIds,
  refresh,
  open,
  toggleEnabled,
  onUninstall,
}: {
  t: (key: string) => string
  items: ExtensionSummary[]
  loading: boolean
  error: { code: string; message: string } | null
  busyIds: string[]
  refresh: () => void
  open: (id: string) => void
  toggleEnabled: (item: ExtensionSummary) => void
  onUninstall: (item: ExtensionSummary) => void
}) {
  if (loading && items.length === 0) {
    return (
      <div className="text-muted-foreground rounded border border-dashed p-8 text-center text-sm">
        {t("extensionCenter.loading")}
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{t("extensionCenter.loadFailed")}</p>
        <p className="mt-1 font-mono text-xs opacity-80">
          [{error.code}] {error.message}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
          {t("extensionCenter.retry")}
        </Button>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center">
        <p className="text-sm font-medium">{t("extensionCenter.empty")}</p>
        <p className="text-muted-foreground mt-1 text-xs">{t("extensionCenter.emptyHint")}</p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left font-medium">{t("extensionCenter.name")}</th>
            <th className="px-4 py-2 text-left font-medium">{t("extensionCenter.version")}</th>
            <th className="px-4 py-2 text-left font-medium">
              {t("extensionCenter.distributionLabel")}
            </th>
            <th className="px-4 py-2 text-left font-medium">{t("extensionCenter.status")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("extensionCenter.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const busy = busyIds.includes(item.id)
            return (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{item.displayZh}</div>
                  <div className="text-muted-foreground text-xs">{item.id}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{item.version}</td>
                <td className="px-4 py-2">
                  <DistributionBadge distribution={item.distribution} t={t} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge enabled={item.enabled} t={t} />
                    {!item.compatible && (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        {t("extensionCenter.incompatible")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !item.enabled}
                      onClick={() => open(item.id)}
                    >
                      {t("extensionCenter.open")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => toggleEnabled(item)}
                    >
                      {item.enabled ? t("extensionCenter.disable") : t("extensionCenter.enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      disabled={busy}
                      onClick={() => onUninstall(item)}
                    >
                      {t("extensionCenter.uninstall")}
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ExtensionCenterPage() {
  const { t } = useTranslation()
  const { items, loading, error, busyIds, refresh, open, toggleEnabled, uninstall } =
    useExtensionCenterController()
  const {
    marketLoading,
    refreshMarket,
    pendingPreview,
    committing,
    confirmInstall,
    cancelInstall,
  } = useMarketController()
  const [uninstallTarget, setUninstallTarget] = useState<ExtensionSummary | null>(null)
  const [tab, setTab] = useState<TabKey>("installed")

  // 首次进入 market 标签页时拉取目录（切走再切回不重复拉取）。
  const [marketVisited, setMarketVisited] = useState(false)
  useEffect(() => {
    if (tab === "market" && !marketVisited) {
      setMarketVisited(true)
      void refreshMarket()
    }
  }, [tab, marketVisited, refreshMarket])

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "installed", label: t("extensionCenter.tabInstalled") },
    { key: "market", label: t("extensionCenter.tabMarket") },
    { key: "diagnostics", label: t("extensionCenter.tabDiagnostics") },
    { key: "bridge", label: t("extensionCenter.tabBridge") },
  ]

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("extensionCenter.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("extensionCenter.subtitle")}</p>
        </div>
        {tab === "installed" && (
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {t("extensionCenter.refresh")}
          </Button>
        )}
        {tab === "market" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshMarket()}
            disabled={marketLoading}
          >
            {t("extensionCenter.refresh")}
          </Button>
        )}
      </header>

      <div className="flex gap-1 border-b">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`rounded-t px-3 py-2 text-sm ${
              tab === entry.key
                ? "border-primary border-b-2 font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "installed" && (
        <InstalledPanel
          t={t}
          items={items}
          loading={loading}
          error={error}
          busyIds={busyIds}
          refresh={() => void refresh()}
          open={(id) => void open(id)}
          toggleEnabled={(item) => void toggleEnabled(item)}
          onUninstall={setUninstallTarget}
        />
      )}
      {tab === "market" && <MarketPanel />}
      {tab === "bridge" && <BridgePanel />}
      {tab === "diagnostics" && <DiagnosticsPanel />}

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
                uninstallTarget.displayZh,
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
    </div>
  )
}
