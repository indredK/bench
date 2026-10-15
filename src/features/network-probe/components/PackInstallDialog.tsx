/**
 * Feature UI / 功能界面: D-017 capability pack install / uninstall dialog.
 */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type {
  CapabilityPackInfo,
  CapabilityPackInstallResult,
} from "@/lib/tauri/types/network-probe"

interface PackInstallDialogProps {
  open: boolean
  packs: CapabilityPackInfo[]
  busy: boolean
  progressText?: string | null
  installResult?: CapabilityPackInstallResult | null
  focusPackId?: string | null
  onOpenChange: (open: boolean) => void
  onInstall: (packId: string) => void
  onVerifyFail?: (packId: string) => void
  onUninstall: (packId: string) => void
  onRefresh: () => void
}

export function PackInstallDialog({
  open,
  packs,
  busy,
  progressText,
  installResult,
  focusPackId,
  onOpenChange,
  onInstall,
  onVerifyFail,
  onUninstall,
  onRefresh,
}: PackInstallDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(focusPackId ?? null)

  useEffect(() => {
    if (focusPackId) setSelected(focusPackId)
  }, [focusPackId])

  const current = packs.find((p) => p.id === selected) ?? packs[0] ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("networkProbe.packs.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("networkProbe.packs.dialogHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ul className="divide-border max-h-56 divide-y overflow-auto rounded-md border text-sm">
            {packs.map((pack) => (
              <li key={pack.id}>
                <button
                  type="button"
                  className={
                    pack.id === current?.id
                      ? "bg-primary/10 w-full px-3 py-2 text-left"
                      : "hover:bg-muted w-full px-3 py-2 text-left"
                  }
                  onClick={() => setSelected(pack.id)}
                >
                  <div className="font-medium">{pack.id}</div>
                  <div className="text-muted-foreground text-xs">
                    {t("networkProbe.packs.meta", {
                      version: pack.version,
                      sizeMb: (pack.sizeBytes / 1_000_000).toFixed(1),
                      status: pack.status,
                    })}
                    {pack.artifactReady ? "" : ` · ${t("networkProbe.packs.markerOnly")}`}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {current ? (
            <div className="space-y-1 text-sm">
              <p>{t(current.descriptionKey)}</p>
              <p className="text-muted-foreground text-xs">
                {t("networkProbe.packs.gatekeeperNote")}
              </p>
              {installResult?.packId === current.id ? (
                <div
                  role={installResult.ok ? "status" : "alert"}
                  aria-live="polite"
                  className={cn(
                    "space-y-1 rounded-md border px-3 py-2 text-xs",
                    installResult.ok
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "border-destructive/40 bg-destructive/5 text-destructive",
                  )}
                >
                  <p className="font-medium">
                    {installResult.mode === "hash-mismatch"
                      ? t("networkProbe.packs.hashMismatch")
                      : installResult.mode === "uninstalled"
                        ? t("networkProbe.packs.uninstallSuccess")
                        : installResult.ok
                          ? t("networkProbe.packs.installSuccess")
                          : t("networkProbe.packs.installFailed")}
                  </p>
                  {installResult.ok && installResult.mode === "marker" ? (
                    <p>{t("networkProbe.packs.markerInstalled")}</p>
                  ) : null}
                  {installResult.message ? (
                    <details className="text-muted-foreground">
                      <summary className="cursor-pointer">
                        {t("networkProbe.packs.resultDetails")}
                      </summary>
                      <p className="mt-1 break-words">{installResult.message}</p>
                    </details>
                  ) : null}
                </div>
              ) : progressText ? (
                <p role="status" aria-live="polite" className="font-mono text-xs">
                  {progressText}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("networkProbe.packs.empty")}</p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onRefresh}>
            {t("networkProbe.packs.refresh")}
          </Button>
          {current?.status === "installed" ? (
            <CommandHint hint={t("networkProbe.cmd.uninstallPack", { packId: current.id })}>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => onUninstall(current.id)}
              >
                {t("networkProbe.packs.uninstall")}
              </Button>
            </CommandHint>
          ) : current ? (
            <CommandHint hint={t("networkProbe.cmd.installPack", { packId: current.id })}>
              <Button type="button" disabled={busy} onClick={() => onInstall(current.id)}>
                {busy ? t("networkProbe.packs.installing") : t("networkProbe.packs.install")}
              </Button>
            </CommandHint>
          ) : null}
          {current && onVerifyFail ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onVerifyFail(current.id)}
            >
              {t("networkProbe.packs.verifyFail")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
