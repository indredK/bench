import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { useExtensionCenterController } from "@/features/extension-center/hooks/useExtensionCenterController"
import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"

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

export default function ExtensionCenterPage() {
  const { t } = useTranslation()
  const { items, loading, error, busyIds, refresh, open, toggleEnabled } =
    useExtensionCenterController()

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("extensionCenter.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("extensionCenter.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {t("extensionCenter.refresh")}
        </Button>
      </header>

      {loading && items.length === 0 ? (
        <div className="text-muted-foreground rounded border border-dashed p-8 text-center text-sm">
          {t("extensionCenter.title")}…
        </div>
      ) : error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{t("extensionCenter.loadFailed")}</p>
          <p className="mt-1 font-mono text-xs opacity-80">
            [{error.code}] {error.message}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void refresh()}>
            {t("extensionCenter.retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm font-medium">{t("extensionCenter.empty")}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t("extensionCenter.emptyHint")}</p>
        </div>
      ) : (
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
                      <StatusBadge enabled={item.enabled} t={t} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !item.enabled}
                          onClick={() => void open(item.id)}
                        >
                          {t("extensionCenter.open")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void toggleEnabled(item)}
                        >
                          {item.enabled
                            ? t("extensionCenter.disable")
                            : t("extensionCenter.enable")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
