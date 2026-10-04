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
import type { ExtensionSummary } from "@/lib/tauri/types/extension-center"

import { CapabilityMatrix } from "./CapabilityMatrix"
import { selectMetadata, useResolvedLocale } from "../lib/metadata"

const verificationMessageKeys: Record<
  NonNullable<ExtensionSummary["verificationMethod"]>,
  string
> = {
  bundledWithApp: "extensionCenter.details.bundledTrust",
  officialRegistryHashes: "extensionCenter.market.verification.officialRegistryHashes",
  minisign: "extensionCenter.market.verification.minisign",
  developmentUnsigned: "extensionCenter.market.verification.developmentUnsigned",
}

export function ExtensionDetailsDialog({
  extension,
  onClose,
}: {
  extension: ExtensionSummary | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useResolvedLocale()
  const verificationMethod = extension?.verificationMethod ?? null
  const unverified = verificationMethod === "developmentUnsigned"

  return (
    <Dialog open={extension !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {extension
              ? selectMetadata(
                  locale,
                  { zh: extension.displayZh, en: extension.displayEn },
                  extension.id,
                )
              : t("extensionCenter.details.title")}
          </DialogTitle>
          <DialogDescription>{extension?.id}</DialogDescription>
        </DialogHeader>
        {extension && (
          <div className="min-h-0 space-y-4 overflow-auto pr-1 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">{t("extensionCenter.version")}</dt>
                <dd className="font-mono">{extension.version}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.details.publisher")}
                </dt>
                <dd>{extension.publisherName ?? t("extensionCenter.market.unknownPublisher")}</dd>
                {extension.publisherName && (
                  <dd className="text-muted-foreground text-xs">
                    {t("extensionCenter.details.publisherSourceNote")}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.details.engines")}
                </dt>
                <dd className="font-mono">{extension.enginesBench}</dd>
                <dd
                  className={
                    extension.compatible ? "text-xs text-green-700" : "text-xs text-red-700"
                  }
                >
                  {extension.compatible
                    ? t("extensionCenter.details.compatible")
                    : t("extensionCenter.details.incompatible")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  {t("extensionCenter.details.trust")}
                </dt>
                <dd
                  className={
                    unverified
                      ? "mt-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
                      : "mt-1 rounded border p-2 text-xs"
                  }
                  role={unverified ? "alert" : "status"}
                >
                  {verificationMethod
                    ? t(verificationMessageKeys[verificationMethod])
                    : t("extensionCenter.details.trustUnknown")}
                </dd>
              </div>
            </dl>

            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-medium">
                  {t("extensionCenter.details.permissionsTitle")}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {t("extensionCenter.details.permissionsHint")}
                </p>
              </div>
              <CapabilityMatrix commands={extension.aclCommands} open />
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("extensionCenter.details.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
