/**
 * Native Apps Section / 自用原生应用: 只做渲染.
 *
 * 私有仓库 indredK/bench-native-apps 的 macOS CI Artifact，由宿主校验后安装；
 * 不依赖付费开发者账号（ad-hoc 签名），因此不属于插件体系，也不进插件市场。
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ExternalLink, Loader2, Package, RefreshCw, Trash2 } from "lucide-react"

import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { AppErrorShape } from "@/lib/tauri/errors"
import type { NativeAppMarketItem } from "@/lib/tauri/types/extension-center"

const appLabelKeys = {
  "local-toolbox": "localToolbox",
  "abb-dev-toolbox": "abbDevToolbox",
} satisfies Record<NativeAppMarketItem["id"], string>

export function NativeAppsSection({
  apps,
  loading,
  error,
  busyIds,
  refresh,
  runAction,
}: {
  apps: NativeAppMarketItem[]
  loading: boolean
  error: AppErrorShape | null
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
    ? t(`integrations.nativeApps.apps.${appLabelKeys[uninstallTarget.id]}.name`)
    : ""

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col gap-2 rounded-lg border p-4"
      aria-labelledby="native-apps-heading"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="native-apps-heading" className="text-sm font-semibold">
          {t("integrations.nativeApps.title")}
        </h2>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={loading}
          onClick={refresh}
          aria-label={t("integrations.refresh")}
          title={t("integrations.refresh")}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("integrations.nativeApps.sourceDisclosure")}
      </p>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{t("integrations.nativeApps.loadFailed")}</p>
          <p className="mt-1 font-mono text-xs break-all opacity-80">
            [{error.code}] {error.message}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
            {t("integrations.retry")}
          </Button>
        </div>
      )}

      {loading && apps.length === 0 && !error ? (
        <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 size={14} className="animate-spin" />
          {t("integrations.loading")}
        </div>
      ) : apps.length === 0 && !error ? (
        <div className="text-muted-foreground rounded border border-dashed p-4 text-center text-sm">
          {t("integrations.nativeApps.empty")}
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {apps.map((app) => {
            const busy = busyIds.includes(app.id)
            const contentKey = appLabelKeys[app.id]
            return (
              <article key={app.id} className="flex min-w-0 flex-col gap-1 px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                    <Package size={16} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">
                      {t(`integrations.nativeApps.apps.${contentKey}.name`)}
                    </h3>
                    <p className="text-muted-foreground truncate text-xs">
                      {t(`integrations.nativeApps.apps.${contentKey}.description`)}
                    </p>
                  </div>
                  {!app.supported ? (
                    <Badge variant="outline">{t("integrations.nativeApps.unsupported")}</Badge>
                  ) : app.conflict ? (
                    <Badge variant="destructive">{t("integrations.nativeApps.pathConflict")}</Badge>
                  ) : app.installed ? (
                    <Badge variant="secondary">{t("integrations.nativeApps.installed")}</Badge>
                  ) : null}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {app.installed && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => runAction(app.id, "open")}
                      >
                        <ExternalLink size={14} />
                        {busy
                          ? t("integrations.nativeApps.opening")
                          : t("integrations.nativeApps.open")}
                      </Button>
                    )}
                    {!app.installed && app.supported && !app.conflict && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => runAction(app.id, "install")}
                      >
                        {busy
                          ? t("integrations.nativeApps.installing")
                          : t("integrations.nativeApps.install")}
                      </Button>
                    )}
                    {app.installed && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => setUninstallTarget(app)}
                        aria-label={t("integrations.nativeApps.uninstall")}
                        title={t("integrations.nativeApps.uninstall")}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
                {app.conflict && (
                  <p className="text-xs text-red-700">
                    {t("integrations.nativeApps.pathConflictDescription")}
                  </p>
                )}
                {!app.supported && (
                  <p className="text-muted-foreground text-xs">
                    {t("integrations.nativeApps.unsupportedDescription")}
                  </p>
                )}
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
        title={t("integrations.nativeApps.uninstallConfirmTitle")}
        description={t("integrations.nativeApps.uninstallConfirmDescription", {
          name: uninstallTargetName,
        })}
        consequence={t("integrations.nativeApps.uninstallConsequence")}
        confirmLabel={t("integrations.nativeApps.uninstall")}
        cancelLabel={t("integrations.cancel")}
        loading={uninstallTarget ? busyIds.includes(uninstallTarget.id) : false}
        onConfirm={() => {
          if (!uninstallTarget) return
          return runAction(uninstallTarget.id, "uninstall")
        }}
      />
    </section>
  )
}
