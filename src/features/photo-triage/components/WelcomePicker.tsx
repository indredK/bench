/**
 * WelcomePicker / 欢迎页：选目录 / 继续上次.
 * 对齐 Python 桌面版欢迎页流程：选择照片目录 → 后台扫描（事件推进度）→
 * 扫描完成自动进入筛选界面；最近 8 个相册可直接续接。
 */
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { FolderOpen, History, Image, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGuardedAsync } from "@/hooks/useGuardedAsync"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"
import { prettyPath } from "@/features/photo-triage/hooks/usePhotoTriageController"

export function WelcomePicker({ controller }: { controller: PhotoTriageController }) {
  const { t } = useTranslation()
  const { recent, scanning, scanStatus, loadError, capabilities } = controller
  const { pending, run } = useGuardedAsync()
  const bootRef = useRef(false)

  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    void uc.loadRecent()
    void uc.loadCapabilities()
  }, [])

  const handlePick = () =>
    run(async () => {
      const dir = await uc.pickFolder()
      if (!dir) return
      await uc.startScan(dir)
    })

  const handleOpen = (src: string) =>
    run(async () => {
      await uc.openAlbum(src)
    })

  const busy = pending || scanning

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-primary/10 flex size-14 items-center justify-center rounded-2xl">
          <Image size={28} className="text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{t("photoTriage.title")}</h1>
        <p className="text-muted-foreground max-w-md text-sm">{t("photoTriage.welcomeHint")}</p>
      </div>

      {scanning || scanStatus?.running ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={22} className="text-primary animate-spin" />
          <span className="text-muted-foreground text-sm">
            {scanStatus?.phase === "list"
              ? t("photoTriage.scanning")
              : t("photoTriage.scanGenerating", {
                  done: scanStatus?.done ?? 0,
                  total: scanStatus?.total || "…",
                })}
          </span>
        </div>
      ) : (
        <Button size="lg" onClick={handlePick} disabled={busy}>
          <FolderOpen size={18} className="mr-2" />
          {t("photoTriage.pickFolder")}
        </Button>
      )}

      {loadError ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive max-w-md rounded-md border px-3 py-2 text-sm break-words">
          {loadError}
        </p>
      ) : null}

      {!capabilities?.has_ffmpeg && !scanning ? (
        <p className="text-muted-foreground text-xs">{t("photoTriage.ffmpegMissing")}</p>
      ) : null}

      {recent.length > 0 ? (
        <div className="w-full max-w-lg">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <History size={13} />
            {t("photoTriage.continueLast")}
          </div>
          <div className="space-y-1.5">
            {recent.map((album) => (
              <button
                key={album.src}
                type="button"
                onClick={() => handleOpen(album.src)}
                disabled={busy}
                className="group bg-card hover:bg-accent/50 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50"
                title={t("photoTriage.openAlbum")}
              >
                <span className="bg-muted flex h-8 w-8 flex-none items-center justify-center rounded-md">
                  <Play size={13} className="text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {prettyPath(album.src)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">{album.last}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {t("photoTriage.openAlbum")}
                </Button>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
