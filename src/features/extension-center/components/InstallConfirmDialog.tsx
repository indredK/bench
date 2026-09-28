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
import type { MarketInstallPreview } from "@/lib/tauri/types/extension-center"
import { selectMetadata, useResolvedLocale } from "../lib/metadata"

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
  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && !committing && onCancel()}>
      <DialogContent
        showCloseButton={!committing}
        onEscapeKeyDown={(event) => committing && event.preventDefault()}
        onPointerDownOutside={(event) => committing && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("extensionCenter.market.trustTitle")}</DialogTitle>
          <DialogDescription>
            {preview
              ? t("extensionCenter.market.trustDescription", {
                  name: selectMetadata(
                    locale,
                    { zh: preview.displayZh, en: preview.displayEn },
                    preview.id,
                  ),
                  version: preview.version,
                  publisher: preview.publisherName ?? t("extensionCenter.market.unknownPublisher"),
                })
              : ""}
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="border-primary/30 bg-primary/5 rounded border p-2 text-xs">
              {t(`extensionCenter.market.trustKind.${preview.trustKind}`)}
            </p>
            <div>
              <p className="mb-1 text-xs font-medium">
                {t("extensionCenter.market.requestedPermissions")}
              </p>
              {preview.aclCommands.length === 0 ? (
                <p className="text-muted-foreground rounded border border-dashed p-2 text-xs">
                  {t("extensionCenter.market.noPermissions")}
                </p>
              ) : (
                <ul className="bg-muted/30 max-h-40 overflow-auto rounded border p-2">
                  {preview.aclCommands.map((command) => (
                    <li key={command} className="font-mono text-xs">
                      {command}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
