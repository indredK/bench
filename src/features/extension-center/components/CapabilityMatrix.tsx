import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { getExtensionCapabilities } from "@/lib/tauri/commands/extension-center"

type CapabilityStatus = "available" | "unavailable" | "unknown"

export function permissionFamilyKey(command: string): string {
  if (command.startsWith("photo_triage_"))
    return "extensionCenter.details.permissionFamily.photoFiles"
  if (
    command.startsWith("list_terminology_") ||
    /^(create|update|delete)_(industry|category|subcategory|term)$/.test(command) ||
    command === "set_term_pinned"
  ) {
    return "extensionCenter.details.permissionFamily.terminology"
  }
  if (
    command.startsWith("scan_dev_projects") ||
    command.includes("custom_cleanup") ||
    command === "cleanup_projects" ||
    command === "stop_scan"
  ) {
    return "extensionCenter.details.permissionFamily.developerCleanup"
  }
  if (
    command.startsWith("scan_storage") ||
    command.startsWith("get_category_items") ||
    command.includes("category_cleanup") ||
    command.includes("custom_folder") ||
    command.includes("cleanup_record") ||
    command === "open_system_storage_settings"
  ) {
    return "extensionCenter.details.permissionFamily.storageCleanup"
  }
  if (command.includes("pricing_standard"))
    return "extensionCenter.details.permissionFamily.pricingStandards"
  if (command.startsWith("douyin_assets_"))
    return "extensionCenter.details.permissionFamily.mediaAssets"
  if (command === "ext_data_dir") return "extensionCenter.details.permissionFamily.privateData"
  if (command.startsWith("ext_"))
    return "extensionCenter.details.permissionFamily.extensionManagement"
  if (
    command.includes("app") ||
    command.includes("inventory") ||
    command.includes("managed_app") ||
    command === "cancel_batch_operation"
  ) {
    return "extensionCenter.details.permissionFamily.installedApps"
  }
  return "extensionCenter.details.permissionFamily.hostCommand"
}

/** Shows each requested ACL entry against the live host allow-list without conflating unknown with denied. */
export function CapabilityMatrix({ commands, open }: { commands: string[]; open: boolean }) {
  const { t } = useTranslation()
  const [hostCommands, setHostCommands] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || commands.length === 0) {
      setHostCommands(null)
      setLoading(false)
      setFailed(false)
      return
    }

    let active = true
    setHostCommands(null)
    setLoading(true)
    setFailed(false)
    void getExtensionCapabilities()
      .then((capabilities) => {
        if (active) setHostCommands(capabilities.commands)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [commands, open])

  if (commands.length === 0) {
    return (
      <p className="text-muted-foreground rounded border border-dashed p-2 text-xs">
        {t("extensionCenter.market.noPermissions")}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {loading
          ? t("extensionCenter.details.capabilityLoading")
          : failed
            ? t("extensionCenter.details.capabilityUnknownHint")
            : t("extensionCenter.details.capabilityHint")}
      </p>
      <ul className="max-h-48 space-y-1 overflow-auto rounded border p-2">
        {commands.map((command) => {
          const status: CapabilityStatus =
            failed || hostCommands === null
              ? "unknown"
              : hostCommands.includes(command)
                ? "available"
                : "unavailable"
          const statusClass =
            status === "available"
              ? "border-green-200 bg-green-50 text-green-700"
              : status === "unavailable"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-border bg-muted/30 text-muted-foreground"
          const statusLabel =
            status === "available"
              ? t("extensionCenter.details.capabilityAvailable")
              : status === "unavailable"
                ? t("extensionCenter.details.capabilityUnavailable")
                : t("extensionCenter.details.capabilityUnknown")
          return (
            <li
              key={command}
              className="flex min-w-0 flex-wrap items-center gap-2 rounded px-1 py-1"
            >
              <span className="min-w-0 flex-1 text-xs">
                <span>{t(permissionFamilyKey(command))}</span>
                <code className="text-muted-foreground ml-1 break-all">{command}</code>
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[11px] ${statusClass}`}>
                {statusLabel}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
