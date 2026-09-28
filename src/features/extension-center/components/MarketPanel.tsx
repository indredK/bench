import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

export function sortInstallableMarketVersions(
  versions: MarketVersionSummary[],
): MarketVersionSummary[] {
  return versions
    .filter((version) => version.installable)
    .sort((a, b) => compareVersions(b.version, a.version))
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
      {version.revokedReason && (
        <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
          {t("extensionCenter.market.revoked")}
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
}: {
  entry: MarketExtensionSummary
  t: (key: string) => string
  onInstall: (extensionId: string, version: string) => void
  busy: boolean
}) {
  const sortedVersions = [...entry.versions].sort((a, b) => compareVersions(b.version, a.version))
  const installableVersions = sortInstallableMarketVersions(entry.versions)
  const hasInstalledVersion = entry.versions.some((version) => version.installed)
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const selected =
    installableVersions.find((version) => version.version === selectedVersion) ??
    installableVersions[0]
  const locale = useResolvedLocale()
  const description = selectMetadata(locale, { zh: entry.descriptionZh, en: entry.descriptionEn })
  const selectorId = `market-version-${entry.id}`

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {selectMetadata(locale, { zh: entry.displayZh, en: entry.displayEn }, entry.id)}
          </h3>
          <p className="text-muted-foreground text-xs">
            {entry.id}
            {entry.publisherName ? ` · ${entry.publisherName}` : ""}
          </p>
          {description && <p className="mt-1 text-xs">{description}</p>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
          {selected ? (
            <>
              <label className="sr-only" htmlFor={selectorId}>
                {t("extensionCenter.market.selectVersion")}
              </label>
              <Select value={selected.version} onValueChange={setSelectedVersion} disabled={busy}>
                <SelectTrigger
                  id={selectorId}
                  aria-label={t("extensionCenter.market.selectVersion")}
                  className="w-28"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {installableVersions.map((version) => (
                    <SelectItem key={version.version} value={version.version}>
                      {version.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onInstall(entry.id, selected.version)}
              >
                {selected.updateAvailable
                  ? t("extensionCenter.market.update")
                  : t("extensionCenter.market.install")}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t(
                hasInstalledVersion
                  ? "extensionCenter.market.noUpdateAvailable"
                  : "extensionCenter.market.noInstallableVersion",
              )}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {sortedVersions.map((version) => (
          <div
            key={version.version}
            className="flex max-w-full min-w-0 flex-col items-start gap-1 rounded border px-2 py-1 text-xs"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-mono">{version.version}</span>
              <VersionBadges version={version} t={t} />
            </div>
            {version.revokedReason && (
              <p className="max-w-full min-w-0 text-xs break-words whitespace-normal text-red-700">
                {t("extensionCenter.market.revokedReason").replace(
                  "{reason}",
                  version.revokedReason,
                )}
              </p>
            )}
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
  if (!marketListing && marketError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{t("extensionCenter.market.loadFailed")}</p>
        <p className="mt-1 text-xs opacity-80">{t("extensionCenter.market.loadFailedHint")}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void refreshMarket()}>
          {t("extensionCenter.retry")}
        </Button>
      </div>
    )
  }
  if (!marketListing) {
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
      {marketError && (
        <div
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-medium">{t("extensionCenter.market.refreshFailed")}</p>
          <p className="mt-1 text-xs">{t("extensionCenter.market.staleDataHint")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={marketLoading}
            onClick={() => void refreshMarket()}
          >
            {t("extensionCenter.retry")}
          </Button>
        </div>
      )}
      {marketLoading && (
        <p role="status" aria-live="polite" className="text-muted-foreground text-xs">
          {t("extensionCenter.market.refreshing")}
        </p>
      )}
      {marketListing.extensions.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm font-medium">{t("extensionCenter.market.empty")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={marketLoading}
            onClick={() => void refreshMarket()}
          >
            {t("extensionCenter.refresh")}
          </Button>
        </div>
      ) : (
        <>
          {marketListing.revokedHits.length > 0 && (
            <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">{t("extensionCenter.market.revokedBanner")}</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {marketListing.revokedHits.map((hit) => (
                  <li key={hit.id}>
                    {hit.id} @ {hit.version}
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
              <div key={entry.id}>
                <ExtensionCard
                  entry={entry}
                  t={t}
                  onInstall={(id, version) => {
                    void prepareInstall(id, version)
                  }}
                  busy={busy}
                />
                {hit && (
                  <p className="mt-1 text-xs text-red-700">
                    {t("extensionCenter.market.revokedNote")}
                  </p>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
