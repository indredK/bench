import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ExternalLink, Loader2, Package, Trash2 } from "lucide-react"

import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { NativeAppMarketItem } from "@/lib/tauri/types/extension-center"

const appLabelKeys = {
  "local-toolbox": "localToolbox",
  "abb-dev-toolbox": "abbDevToolbox",
} satisfies Record<NativeAppMarketItem["id"], string>

export function NativeAppMarketSection({
  apps,
  loading,
  error,
  busyIds,
  refresh,
  runAction,
}: {
  apps: NativeAppMarketItem[]
  loading: boolean
  error: { code: string; message: string } | null
  busyIds: string[]
  refresh: () => void
  runAction: (
    appId: NativeAppMarketItem["id"],
    action: "install" | "open" | "uninstall",
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const [uninstallTarget, setUninstallTarget] = useState<NativeAppMarketItem | null>(null)
  const uninstallTargetName = uninstallTarget
    ? t(`extensionCenter.nativeApps.apps.${appLabelKeys[uninstallTarget.id]}.name`)
    : ""

  return (
    <section className="flex flex-col gap-3" aria-labelledby="native-app-market-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="native-app-market-heading" className="text-sm font-semibold">
          {t("extensionCenter.nativeApps.title")}
        </h2>
        <Button size="sm" variant="outline" disabled={loading} onClick={refresh}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : t("extensionCenter.refresh")}
        </Button>
      </div>
      <p className="text-muted-foreground bg-muted/40 rounded px-3 py-2 text-xs leading-relaxed">
        {t("extensionCenter.nativeApps.sourceDisclosure")}
      </p>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{t("extensionCenter.nativeApps.loadFailed")}</p>
          <p className="mt-1 font-mono text-xs opacity-80">
            [{error.code}] {error.message}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
            {t("extensionCenter.retry")}
          </Button>
        </div>
      )}

      {loading && apps.length === 0 && !error ? (
        <div className="text-muted-foreground rounded border border-dashed p-8 text-center text-sm">
          {t("extensionCenter.loading")}
        </div>
      ) : apps.length === 0 && !error ? (
        <div className="text-muted-foreground rounded border border-dashed p-8 text-center text-sm">
          {t("extensionCenter.nativeApps.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {apps.map((app) => {
            const busy = busyIds.includes(app.id)
            const contentKey = appLabelKeys[app.id]
            return (
              <article key={app.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                      <Package size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">
                        {t(`extensionCenter.nativeApps.apps.${contentKey}.name`)}
                      </h3>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t(`extensionCenter.nativeApps.apps.${contentKey}.description`)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {!app.supported ? (
                      <Badge variant="outline">{t("extensionCenter.nativeApps.unsupported")}</Badge>
                    ) : app.conflict ? (
                      <Badge variant="destructive">
                        {t("extensionCenter.nativeApps.pathConflict")}
                      </Badge>
                    ) : app.installed ? (
                      <Badge variant="secondary">{t("extensionCenter.market.installed")}</Badge>
                    ) : null}
                  </div>
                </div>

                {app.conflict && (
                  <p className="text-xs text-red-700">
                    {t("extensionCenter.nativeApps.pathConflictDescription")}
                  </p>
                )}
                {!app.supported && (
                  <p className="text-muted-foreground text-xs">
                    {t("extensionCenter.nativeApps.unsupportedDescription")}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {app.installed && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => runAction(app.id, "open")}
                    >
                      <ExternalLink size={14} />
                      {busy
                        ? t("extensionCenter.nativeApps.opening")
                        : t("extensionCenter.nativeApps.open")}
                    </Button>
                  )}
                  {!app.installed && app.supported && !app.conflict && (
                    <Button size="sm" disabled={busy} onClick={() => runAction(app.id, "install")}>
                      {busy
                        ? t("extensionCenter.nativeApps.installing")
                        : t("extensionCenter.market.install")}
                    </Button>
                  )}
                  {app.installed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700"
                      disabled={busy}
                      onClick={() => setUninstallTarget(app)}
                    >
                      <Trash2 size={14} />
                      {t("extensionCenter.nativeApps.uninstall")}
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <DestructiveConfirmDialog
        open={uninstallTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUninstallTarget(null)
        }}
        title={t("extensionCenter.nativeApps.uninstallConfirmTitle")}
        description={t("extensionCenter.nativeApps.uninstallConfirmDescription", {
          name: uninstallTargetName,
        })}
        consequence={t("extensionCenter.nativeApps.uninstallConsequence")}
        confirmLabel={t("extensionCenter.nativeApps.uninstall")}
        cancelLabel={t("extensionCenter.cancel")}
        loading={uninstallTarget ? busyIds.includes(uninstallTarget.id) : false}
        onConfirm={() => {
          if (!uninstallTarget) return
          return runAction(uninstallTarget.id, "uninstall")
        }}
      />
    </section>
  )
}
