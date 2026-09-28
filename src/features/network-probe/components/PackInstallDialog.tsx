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
import type { CapabilityPackInfo, CapabilityPackProgress } from "@/lib/tauri/types/network-probe"

const PACK_PROGRESS_PHASE_KEYS = {
  validating: "networkProbe.packs.progressPhase.validating",
  downloading: "networkProbe.packs.progressPhase.downloading",
  verifying: "networkProbe.packs.progressPhase.verifying",
  marker: "networkProbe.packs.progressPhase.marker",
  done: "networkProbe.packs.progressPhase.done",
  failed: "networkProbe.packs.progressPhase.failed",
} as const

const PACK_NAME_KEYS = {
  "adv-scanner": "networkProbe.packs.names.advScanner",
  "pcap-diag": "networkProbe.packs.names.pcapDiag",
  "priv-helper": "networkProbe.packs.names.privHelper",
} as const

function formatBytes(bytes: number, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  if (bytes >= 1_000_000) return `${formatter.format(bytes / 1_000_000)} MB`
  if (bytes >= 1_000) return `${formatter.format(bytes / 1_000)} KB`
  return `${new Intl.NumberFormat(locale).format(bytes)} B`
}

interface PackInstallDialogProps {
  open: boolean
  packs: CapabilityPackInfo[]
  busy: boolean
  progress?: CapabilityPackProgress | null
  progressText?: string | null
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
  progress,
  progressText,
  focusPackId,
  onOpenChange,
  onInstall,
  onVerifyFail,
  onUninstall,
  onRefresh,
}: PackInstallDialogProps) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState<string | null>(focusPackId ?? null)

  useEffect(() => {
    if (focusPackId) setSelected(focusPackId)
  }, [focusPackId])

  const current = packs.find((p) => p.id === selected) ?? packs[0] ?? null
  const progressLabel = progress
    ? (() => {
        const packNameKey = PACK_NAME_KEYS[progress.packId as keyof typeof PACK_NAME_KEYS]
        const phaseKey =
          PACK_PROGRESS_PHASE_KEYS[progress.phase as keyof typeof PACK_PROGRESS_PHASE_KEYS]
        const packName = packNameKey ? t(packNameKey) : progress.packId
        const phase = phaseKey ? t(phaseKey) : t("networkProbe.packs.progressPhase.unknown")
        if (progress.totalBytes <= 0) {
          return t("networkProbe.packs.progressPhaseOnly", { packId: packName, phase })
        }
        return t("networkProbe.packs.progressBytes", {
          packId: packName,
          phase,
          bytes: formatBytes(progress.bytes, i18n.language),
          totalBytes: formatBytes(progress.totalBytes, i18n.language),
        })
      })()
    : progressText

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
                  disabled={busy}
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
              {progressLabel ? <p className="font-mono text-xs">{progressLabel}</p> : null}
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
