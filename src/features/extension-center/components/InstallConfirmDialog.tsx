import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  MarketExtensionSummary,
  MarketInstallPreview,
  MarketVersionSummary,
} from "@/lib/tauri/types/extension-center"

import { selectMetadata, useResolvedLocale } from "../lib/metadata"
import { describePermission } from "../lib/permission-descriptions"

type PermissionGroup =
  | "extensionManagement"
  | "photoTriage"
  | "terminology"
  | "storageCleanup"
  | "tokenPricing"
  | "contentAssets"
  | "installedApps"
  | "other"

const STORAGE_COMMANDS = new Set([
  "get_category_items",
  "execute_category_cleanup",
  "scan_custom_folder",
  "open_system_storage_settings",
  "get_cleanup_records",
  "add_cleanup_record",
  "scan_dev_projects",
  "cleanup_projects",
  "stop_scan",
  "get_custom_cleanup_commands",
  "execute_custom_cleanup",
  "stop_custom_cleanup",
])

const TERMINOLOGY_COMMANDS = new Set([
  "list_terminology_data",
  "create_industry",
  "update_industry",
  "delete_industry",
  "create_category",
  "update_category",
  "delete_category",
  "create_subcategory",
  "update_subcategory",
  "delete_subcategory",
  "create_term",
  "update_term",
  "delete_term",
  "set_term_pinned",
])

const TOKEN_PRICING_COMMANDS = new Set([
  "list_pricing_standards",
  "create_pricing_standard",
  "update_pricing_standard",
  "delete_pricing_standard",
])

const INSTALLED_APP_COMMANDS = new Set([
  "scan_installed_apps",
  "cancel_app_inventory_scan",
  "get_cached_app_inventory",
  "get_app_icon_base64",
  "launch_app",
  "reveal_app_in_finder",
  "authorize_mac_app",
  "check_managed_app_updates",
  "upgrade_app",
  "uninstall_app",
  "batch_upgrade_apps",
  "batch_uninstall_apps",
  "install_app",
  "cancel_batch_operation",
  "check_all_app_updates",
  "open_in_mac_app_store",
  "open_in_mac_app_store_updates",
  "install_app_update",
  "cancel_app_update",
])

function permissionGroup(command: string): PermissionGroup {
  if (command.startsWith("ext_")) return "extensionManagement"
  if (command.startsWith("photo_triage_")) return "photoTriage"
  if (TERMINOLOGY_COMMANDS.has(command)) return "terminology"
  if (command.startsWith("scan_storage_") || STORAGE_COMMANDS.has(command)) return "storageCleanup"
  if (TOKEN_PRICING_COMMANDS.has(command)) return "tokenPricing"
  if (command.startsWith("douyin_assets_")) return "contentAssets"
  if (INSTALLED_APP_COMMANDS.has(command)) return "installedApps"
  return "other"
}

function groupPermissions(commands: string[]): Array<[PermissionGroup, string[]]> {
  const groups = new Map<PermissionGroup, string[]>()
  for (const command of commands) {
    const group = permissionGroup(command)
    const groupCommands = groups.get(group) ?? []
    groupCommands.push(command)
    groups.set(group, groupCommands)
  }
  return [...groups.entries()]
}

function permissionGroupLabel(group: PermissionGroup, t: (key: string) => string): string {
  switch (group) {
    case "extensionManagement":
      return t("extensionCenter.market.permissionGroups.extensionManagement")
    case "photoTriage":
      return t("extensionCenter.market.permissionGroups.photoTriage")
    case "terminology":
      return t("extensionCenter.market.permissionGroups.terminology")
    case "storageCleanup":
      return t("extensionCenter.market.permissionGroups.storageCleanup")
    case "tokenPricing":
      return t("extensionCenter.market.permissionGroups.tokenPricing")
    case "contentAssets":
      return t("extensionCenter.market.permissionGroups.contentAssets")
    case "installedApps":
      return t("extensionCenter.market.permissionGroups.installedApps")
    case "other":
      return t("extensionCenter.market.permissionGroups.other")
  }
}

function formatBytes(value: number, locale: string): string {
  const kilobytes = value / 1024
  const amount = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: kilobytes < 10 ? 1 : 0,
  }).format(kilobytes)
  return `${amount} KB`
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
  }).format(date)
}

/**
 * Market detail and install review. Registry data is visible immediately; ACL and
 * trust claims appear only after the backend has downloaded and verified the package.
 */
export function InstallConfirmDialog({
  entry,
  version,
  preview,
  verifying,
  committing,
  onVerify,
  onConfirm,
  onCancel,
}: {
  entry: MarketExtensionSummary | null
  version: MarketVersionSummary | null
  preview: MarketInstallPreview | null
  verifying: boolean
  committing: boolean
  onVerify: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const locale = useResolvedLocale()
  const open = entry !== null && version !== null
  const matchingPreview =
    entry && version && preview?.id === entry.id && preview.version === version.version
      ? preview
      : null
  const name = entry
    ? selectMetadata(locale, { zh: entry.displayZh, en: entry.displayEn }, entry.id)
    : ""
  const description = entry
    ? selectMetadata(locale, { zh: entry.descriptionZh, en: entry.descriptionEn })
    : ""
  const publishedAt = formatDate(version?.publishedAt ?? null, locale)
  const locked = verifying || committing

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !locked && onCancel()}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!locked && Boolean(version?.installable)}
        onEscapeKeyDown={(event) => locked && event.preventDefault()}
        onPointerDownOutside={(event) => locked && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("extensionCenter.market.detailsTitle")}</DialogTitle>
          <DialogDescription>
            {entry && version
              ? t("extensionCenter.market.detailsDescription", {
                  name,
                  id: entry.id,
                  version: version.version,
                })
              : ""}
          </DialogDescription>
        </DialogHeader>

        {entry && version && (
          <div className="flex flex-col gap-4 text-sm">
            {description && <p>{description}</p>}

            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 rounded border p-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.market.publisher")}
                </dt>
                <dd className="break-words">
                  {entry.publisherName ?? t("extensionCenter.market.unknownPublisher")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.market.releaseVersion")}
                </dt>
                <dd className="font-mono">{version.version}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.market.requiresBenchLabel")}
                </dt>
                <dd className="font-mono">
                  {matchingPreview?.enginesBench ?? version.enginesBench}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.market.packageSize")}
                </dt>
                <dd>{formatBytes(version.size, locale)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.market.publishedAt")}
                </dt>
                <dd>{publishedAt ?? t("extensionCenter.market.unknownDate")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.market.releaseStatus")}
                </dt>
                <dd className="flex flex-wrap gap-1">
                  {!version.compatible && (
                    <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                      {t("extensionCenter.market.unsupported")}
                    </span>
                  )}
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
                  {version.compatible && !version.yanked && !version.revokedReason && (
                    <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                      {t("extensionCenter.market.compatible")}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {version.revokedReason && (
              <p className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {t("extensionCenter.market.revokedReason").replace(
                  "{reason}",
                  version.revokedReason,
                )}
              </p>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{t("extensionCenter.market.verificationTitle")}</h3>
              {matchingPreview ? (
                <p className="border-primary/30 bg-primary/5 rounded border p-3 text-xs">
                  {t(`extensionCenter.market.trustKind.${matchingPreview.trustKind}`)}
                </p>
              ) : (
                <p role="status" className="text-muted-foreground rounded border p-3 text-xs">
                  {t("extensionCenter.market.verifyToViewPermissions")}
                </p>
              )}

              <h4 className="text-xs font-medium">
                {t("extensionCenter.market.requestedPermissions")}
              </h4>
              {!matchingPreview || matchingPreview.aclCommands.length === 0 ? (
                <p className="text-muted-foreground rounded border border-dashed p-3 text-xs">
                  {matchingPreview
                    ? t("extensionCenter.market.noPermissions")
                    : t("extensionCenter.market.permissionsHiddenUntilVerified")}
                </p>
              ) : (
                <div className="max-h-52 overflow-auto rounded border">
                  {groupPermissions(matchingPreview.aclCommands).map(([group, commands]) => (
                    <div key={group} className="border-b p-3 last:border-0">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-xs font-medium">{permissionGroupLabel(group, t)}</p>
                        <span className="shrink-0 rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                          {t("extensionCenter.market.supported")}
                        </span>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {commands.map((command) => (
                          <li key={command} className="text-xs leading-relaxed break-words">
                            {describePermission(command, t)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-xs">
                {t("extensionCenter.market.capabilityStatusNote")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("extensionCenter.market.noOptionalPacks")}
              </p>
              {version.updateAvailable && (
                <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  {t("extensionCenter.market.updateClosesOpenWindow")}
                </p>
              )}
            </section>

            <p className="text-muted-foreground text-xs">{t("extensionCenter.market.trustNote")}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={locked}>
            {version?.installable ? t("extensionCenter.cancel") : t("extensionCenter.close")}
          </Button>
          {version?.installable && (
            <Button onClick={matchingPreview ? onConfirm : onVerify} disabled={locked}>
              {committing
                ? t("extensionCenter.market.installing")
                : verifying
                  ? t("extensionCenter.market.verifying")
                  : matchingPreview
                    ? t("extensionCenter.market.trustAndInstall")
                    : t("extensionCenter.market.verifyPackage")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
