import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CapabilityMatrix } from "@/features/extension-center/components/CapabilityMatrix"
import type { MarketInstallPreview } from "@/lib/tauri/types/extension-center"
import { selectMetadata, useResolvedLocale } from "../lib/metadata"

const VERIFICATION_MESSAGE_KEYS = {
  officialRegistryHashes: "extensionCenter.market.verification.officialRegistryHashes",
  minisign: "extensionCenter.market.verification.minisign",
  developmentUnsigned: "extensionCenter.market.verification.developmentUnsigned",
} as const

/**
 * 信任披露弹窗（A4-1，对标 VS Code publisher trust）：安装前展示
 * 发布者、版本与该插件申请的全部宿主命令（ACL，deny-by-default 网关语义）。
 */
export function InstallConfirmDialog({
  preview,
  committing,
  onConfirm,
  onCancel,
}: {
  preview: MarketInstallPreview | null
  committing: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const locale = useResolvedLocale()
  const isUnverified = preview?.verificationMethod === "developmentUnsigned"
  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && !committing && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("extensionCenter.market.trustTitle")}</DialogTitle>
          <DialogDescription>
            {preview
              ? t("extensionCenter.market.trustDescription")
                  .replace(
                    "{name}",
                    selectMetadata(
                      locale,
                      { zh: preview.displayZh, en: preview.displayEn },
                      preview.id,
                    ),
                  )
                  .replace("{version}", preview.version)
                  .replace(
                    "{publisher}",
                    preview.publisherName ?? t("extensionCenter.market.unknownPublisher"),
                  )
              : ""}
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="flex flex-col gap-3 text-sm">
            <p
              className={
                isUnverified
                  ? "rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
                  : "text-muted-foreground rounded border p-2 text-xs"
              }
              role={isUnverified ? "alert" : "status"}
            >
              {t(VERIFICATION_MESSAGE_KEYS[preview.verificationMethod])}
            </p>
            <div>
              <p className="mb-1 text-xs font-medium">
                {t("extensionCenter.market.requestedPermissions")}
              </p>
              <CapabilityMatrix commands={preview.aclCommands} open={preview !== null} />
            </div>
            <p className="text-muted-foreground text-xs">
              {t("extensionCenter.details.engines")}: <code>{preview.enginesBench}</code>
            </p>
            <p className="text-muted-foreground text-xs">{t("extensionCenter.market.trustNote")}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={committing}>
            {t("extensionCenter.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={committing}>
            {committing
              ? t("extensionCenter.market.installing")
              : t("extensionCenter.market.trustAndInstall")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
