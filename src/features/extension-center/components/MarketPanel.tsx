/**
 * Market Panel / 插件市场: 只做渲染.
 *
 * 官方插件目录（plugin-market 仓库的静态 registry）：一行 = 一个插件，
 * 名称/说明 | 最新版本（已装 → 最新）| 状态 | 安装 · 更新。
 * 安装走「prepare 校验 → 信任披露 → commit」两段，这里只触发 prepare。
 */
import { useTranslation } from "react-i18next"
import { ArrowRight, Loader2, Puzzle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  MarketExtensionSummary,
  MarketListing,
  RevokedHit,
} from "@/lib/tauri/types/extension-center"
import type { AppErrorShape } from "@/lib/tauri/errors"

import { selectMetadata, useResolvedLocale } from "../lib/metadata"
import { latestInstallable } from "../lib/versions"

const GRID = "grid-cols-[minmax(0,1fr)_9rem_8rem_8rem]"

export function MarketPanel({
  listing,
  loading,
  error,
  busyIds,
  installedVersions,
  onRefresh,
  onInstall,
}: {
  listing: MarketListing | null
  loading: boolean
  error: AppErrorShape | null
  busyIds: string[]
  /** 本地已装插件的版本（id → version），用来显示「已装 → 最新」。 */
  installedVersions: Record<string, string>
  onRefresh: () => void
  onInstall: (extensionId: string, version: string) => void
}) {
  const { t } = useTranslation()
  const locale = useResolvedLocale()

  const revokedById = new Map<string, RevokedHit>(
    (listing?.revokedHits ?? []).map((hit) => [hit.id, hit]),
  )

  if (loading && listing === null && !error) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
        <Loader2 size={16} className="animate-spin" />
        {t("extensionCenter.loading")}
      </div>
    )
  }

  if (error && listing === null) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{t("extensionCenter.market.loadFailed")}</p>
        <p className="mt-1 font-mono text-xs break-all opacity-80">
          [{error.code}] {error.message}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRefresh}>
          {t("extensionCenter.retry")}
        </Button>
      </div>
    )
  }

  const extensions = listing?.extensions ?? []

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="text-xs text-red-700">
          {t("extensionCenter.market.refreshFailed")}：
          <span className="font-mono">
            [{error.code}] {error.message}
          </span>
        </p>
      ) : null}

      {listing?.revokedHits.length ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">{t("extensionCenter.market.revokedBanner")}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {listing.revokedHits.map((hit) => (
              <li key={hit.id}>
                {hit.id} @ {hit.version} — {hit.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extensions.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
          <Puzzle size={28} className="opacity-40" />
          <p className="text-sm">{t("extensionCenter.market.empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div
            className={`bg-muted/50 text-muted-foreground grid ${GRID} items-center gap-3 px-4 py-2 text-xs font-medium`}
          >
            <span>{t("extensionCenter.name")}</span>
            <span>{t("extensionCenter.market.latest")}</span>
            <span>{t("extensionCenter.status")}</span>
            <span className="text-right">{t("extensionCenter.actions")}</span>
          </div>
          {extensions.map((entry) => (
            <MarketRow
              key={entry.id}
              entry={entry}
              locale={locale}
              revoked={revokedById.get(entry.id)}
              installedVersion={installedVersions[entry.id]}
              busy={entry.versions.some((version) =>
                busyIds.includes(`${entry.id}@${version.version}`),
              )}
              onInstall={onInstall}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MarketRow({
  entry,
  locale,
  revoked,
  installedVersion,
  busy,
  onInstall,
}: {
  entry: MarketExtensionSummary
  locale: string
  revoked: RevokedHit | undefined
  installedVersion: string | undefined
  busy: boolean
  onInstall: (extensionId: string, version: string) => void
}) {
  const { t } = useTranslation()
  const latest = latestInstallable(entry)
  const description = selectMetadata(locale, { zh: entry.descriptionZh, en: entry.descriptionEn })
  const canInstall = Boolean(latest && !latest.installed && latest.compatible && !revoked)
  const detail = [entry.id, entry.publisherName].filter(Boolean).join(" · ")

  return (
    <div className={`grid ${GRID} items-center gap-3 border-t px-4 py-2.5`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {selectMetadata(locale, { zh: entry.displayZh, en: entry.displayEn }, entry.id)}
        </p>
        <p className="text-muted-foreground truncate text-xs" title={description || detail}>
          {description || detail}
        </p>
        {revoked ? (
          <p className="truncate text-xs text-red-700" title={revoked.reason}>
            {t("extensionCenter.market.revokedNote").replace("{reason}", revoked.reason)}
          </p>
        ) : null}
      </div>
      <span className="inline-flex items-center gap-1 font-mono text-xs">
        {latest?.updateAvailable && installedVersion ? (
          <>
            <span className="text-muted-foreground">{installedVersion}</span>
            <ArrowRight size={11} className="text-muted-foreground" aria-hidden />
            <span className="font-semibold">{latest.version}</span>
          </>
        ) : (
          (latest?.version ?? "—")
        )}
      </span>
      <div className="flex flex-col items-start gap-1">
        {latest?.updateAvailable ? (
          <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
            {t("extensionCenter.market.updateAvailable")}
          </Badge>
        ) : latest?.installed ? (
          <Badge variant="secondary">{t("extensionCenter.market.installed")}</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("extensionCenter.market.notInstalled")}
          </span>
        )}
        {latest && !latest.compatible ? (
          <Badge variant="destructive">
            {t("extensionCenter.market.requiresBench").replace("{range}", latest.enginesBench)}
          </Badge>
        ) : null}
      </div>
      <div className="flex justify-end">
        {latest && (canInstall || (latest.updateAvailable && !revoked)) ? (
          <Button
            size="sm"
            disabled={busy || !canInstall}
            onClick={() => onInstall(entry.id, latest.version)}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {latest.updateAvailable
              ? t("extensionCenter.market.update")
              : t("extensionCenter.market.install")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
