import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import type {
  MarketExtensionSummary,
  MarketVersionSummary,
  RevokedHit,
} from "@/lib/tauri/types/extension-center"

import { useMarketController } from "../hooks/useMarketController"
import { selectMetadata, useResolvedLocale } from "../lib/metadata"

/** 数字段比较（与后端 `version_at_least` 同口径）：a &gt; b 返回正数。 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .split(".")
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0)
  const [left, right] = [parse(a), parse(b)]
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function VersionBadges({
  version,
  t,
}: {
  version: MarketVersionSummary
  t: (key: string) => string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {version.yanked && (
        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
          {t("extensionCenter.market.yanked")}
        </span>
      )}
      {!version.compatible && (
        <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
          {t("extensionCenter.market.requiresBench").replace("{range}", version.enginesBench)}
        </span>
      )}
      {version.installed && (
        <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
          {t("extensionCenter.market.installed")}
        </span>
      )}
      {version.updateAvailable && (
        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          {t("extensionCenter.market.updateAvailable")}
        </span>
      )}
    </div>
  )
}

function ExtensionCard({
  entry,
  t,
  onInstall,
  busy,
  revoked,
}: {
  entry: MarketExtensionSummary
  t: (key: string) => string
  onInstall: (extensionId: string, version: string) => void
  busy: boolean
  revoked?: boolean
}) {
  // 可安装版本：非 yanked；优先最新。必须按数字段比较 —— localeCompare 会把
  // 0.10.0 排在 0.9.0 之前，导致真正的最新版被判「已装」而整颗按钮不渲染。
  const sortedVersions = [...entry.versions].sort((a, b) => compareVersions(b.version, a.version))
  const installable = sortedVersions.filter((version) => !version.yanked)
  const latestInstallable = installable[0]
  const locale = useResolvedLocale()
  const description = selectMetadata(locale, { zh: entry.descriptionZh, en: entry.descriptionEn })

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">
            {selectMetadata(locale, { zh: entry.displayZh, en: entry.displayEn }, entry.id)}
          </h3>
          <p className="text-muted-foreground text-xs">
            {entry.id}
            {entry.publisherName ? ` · ${entry.publisherName}` : ""}
          </p>
          {description && <p className="mt-1 text-xs">{description}</p>}
        </div>
        {latestInstallable && !latestInstallable.installed && (
          <Button
            size="sm"
            /* 已吊销的插件不得再安装/更新：卡片下方就是红色吊销说明，
               按钮若仍可点，等于告诉用户「警示只是装饰」。 */
            disabled={busy || !latestInstallable.compatible || Boolean(revoked)}
            onClick={() => onInstall(entry.id, latestInstallable.version)}
          >
            {latestInstallable.updateAvailable
              ? t("extensionCenter.market.update")
              : t("extensionCenter.market.install")}
          </Button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {sortedVersions.map((version) => (
          <div
            key={version.version}
            className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
          >
            <span className="font-mono">{version.version}</span>
            <VersionBadges version={version} t={t} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** P4 market 面板：registry 目录浏览 + 信任披露 + 安装/升级。 */
export function MarketPanel() {
  const { t } = useTranslation()
  const { marketListing, marketLoading, marketError, busyIds, refreshMarket, prepareInstall } =
    useMarketController()

  if (marketLoading && marketListing === null) {
    return (
      <div className="text-muted-foreground rounded border border-dashed p-8 text-center text-sm">
        {t("extensionCenter.loading")}
      </div>
    )
  }
  if (marketError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{t("extensionCenter.market.loadFailed")}</p>
        <p className="mt-1 font-mono text-xs opacity-80">
          [{marketError.code}] {marketError.message}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void refreshMarket()}>
          {t("extensionCenter.retry")}
        </Button>
      </div>
    )
  }
  if (!marketListing || marketListing.extensions.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center">
        <p className="text-sm font-medium">{t("extensionCenter.market.empty")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void refreshMarket()}>
          {t("extensionCenter.refresh")}
        </Button>
      </div>
    )
  }

  const revokedById = new Map<string, RevokedHit>(
    marketListing.revokedHits.map((hit) => [hit.id, hit]),
  )

  return (
    <div className="flex flex-col gap-3">
      {marketListing.revokedHits.length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">{t("extensionCenter.market.revokedBanner")}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {marketListing.revokedHits.map((hit) => (
              <li key={hit.id}>
                {hit.id} @ {hit.version} — {hit.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {marketListing.extensions.map((entry) => {
        const hit = revokedById.get(entry.id)
        const busy = entry.versions.some((version) =>
          busyIds.includes(`${entry.id}@${version.version}`),
        )
        return (
          <div key={entry.id} className={hit ? "opacity-60" : undefined}>
            <ExtensionCard
              entry={entry}
              t={t}
              revoked={Boolean(hit)}
              onInstall={(id, version) => {
                if (revokedById.has(id)) return
                void prepareInstall(id, version)
              }}
              busy={busy}
            />
            {hit && (
              <p className="mt-1 text-xs text-red-700">
                {t("extensionCenter.market.revokedNote").replace("{reason}", hit.reason)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
