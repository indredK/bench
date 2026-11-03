/**
 * Update Status Chip / 更新提示条: 对话框收起后仍可见的更新状态.
 *
 * 静默检查发现新版本、下载/安装在后台进行、等待重启、安装失败时，
 * 在右下角显示一条紧凑状态（含真实进度），点击回到更新对话框。
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, Download, Loader2, TriangleAlert, X } from "lucide-react"

import { percentOf } from "@/features/updater/services/download-progress"
import type { UpdaterController } from "@/features/updater/hooks/useUpdaterController"
import { cn } from "@/lib/utils"

type ChipProps = Pick<
  UpdaterController,
  "open" | "status" | "updateInfo" | "downloadedBytes" | "totalBytes" | "openDialog"
>

export function UpdateStatusChip({
  open,
  status,
  updateInfo,
  downloadedBytes,
  totalBytes,
  openDialog,
}: ChipProps) {
  const { t } = useTranslation()
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const version = updateInfo?.version ?? null

  if (open) return null
  if (status === "available" && version !== null && dismissedVersion === version) return null

  const percent = percentOf(downloadedBytes, totalBytes)
  let icon = <Download className="size-4" />
  let label = ""
  let tone = "border-border"

  switch (status) {
    case "available":
      label = t("updater.chip.available", { version: version ?? "" })
      break
    case "downloading":
      icon = <Loader2 className="size-4 animate-spin" />
      label =
        percent === null
          ? t("updater.chip.downloading")
          : t("updater.chip.downloadingPercent", { percent })
      break
    case "cancelling":
      icon = <Loader2 className="size-4 animate-spin" />
      label = t("updater.cancelling")
      break
    case "installing":
      icon = <Loader2 className="size-4 animate-spin" />
      label = t("updater.installing")
      break
    case "readyToRestart":
      icon = <CheckCircle2 className="size-4 text-emerald-600" />
      label = t("updater.chip.readyToRestart")
      tone = "border-emerald-300"
      break
    case "installFailed":
      icon = <TriangleAlert className="text-destructive size-4" />
      label = t("updater.chip.installFailed")
      tone = "border-destructive/50"
      break
    default:
      return null
  }

  const showBar = status === "downloading" && percent !== null

  return (
    <div
      className={cn(
        "bg-popover text-popover-foreground fixed right-4 bottom-4 z-40 flex w-64 flex-col gap-1.5 overflow-hidden rounded-lg border p-2.5 shadow-lg",
        tone,
      )}
      role="status"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openDialog}
          className="hover:text-foreground flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          {icon}
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
        {status === "available" && version !== null ? (
          <button
            type="button"
            aria-label={t("updater.chip.dismiss")}
            title={t("updater.chip.dismiss")}
            onClick={() => setDismissedVersion(version)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-0.5"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {showBar ? (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-150"
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          />
        </div>
      ) : null}
    </div>
  )
}
