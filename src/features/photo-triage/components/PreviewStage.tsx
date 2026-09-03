/**
 * PreviewStage / 大图/视频预览 + 元信息 + 操作按钮 + 大图查看.
 * 对齐 Python `triage.html`：
 * - 详情区：大图/视频预览、文件名、类型、大小、实况切换、上下张、留/删/恢复；
 * - 点击大图进入 Lightbox：fit → 100% → 200% 循环缩放，方便判断清晰度；
 * - 空格播放/暂停视频；预览大图可拖到待选文件夹卡片移动；
 * - 视频无 ffmpeg 时回退静态封面，仍可打开原文件播放（浏览器原生解码）。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"
import { prettyPath, toAssetUrl } from "@/features/photo-triage/hooks/usePhotoTriageController"
import { setDragImage } from "@/features/photo-triage/lib/drag"
import { usePhotoTriageStore } from "@/features/photo-triage/store"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"

type Zoom = 0 | 1 | 2

export const PreviewStage = memo(function PreviewStage({
  controller,
  onRestore,
}: {
  controller: PhotoTriageController
  onRestore: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const { current, currentIndex, visible, liveView, nav, markCurrent, dragActive } = controller
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isVideo, setIsVideo] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [zoom, setZoom] = useState<Zoom>(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const deleted = current ? controller.deletedSet.has(current.id) : false

  const proxyOf = useCallback(
    async (it: NonNullable<typeof current>) => {
      // video 类型：优先 4 秒片段（降级静态封面）；live: motion 用视频片段，否则静态图
      if (it.type === "video") {
        const v = await uc.ensureProxy(it.id, "video")
        setIsVideo(true)
        setVideoSrc(v)
        return
      }
      if (it.type === "live" && liveView === "motion") {
        const v = await uc.ensureProxy(it.id, "video")
        if (v) {
          setIsVideo(true)
          setVideoSrc(v)
          return
        }
      }
      setIsVideo(false)
      setVideoSrc(null)
      const img = await uc.ensureProxy(it.id, "image")
      setImageSrc(img)
    },
    [liveView],
  )

  useEffect(() => {
    setZoom(0)
    setLightboxOpen(false)
    setImageSrc(null)
    setVideoSrc(null)
    setIsVideo(false)
    if (current && !deleted) void proxyOf(current)
  }, [current?.id, proxyOf, deleted])

  // 空格：播放 / 暂停视频（对齐 Python keydown 空格）
  useEffect(() => {
    if (!isVideo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault()
        const v = videoRef.current
        if (!v) return
        if (v.paused) void v.play()
        else v.pause()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isVideo])

  // Esc：关闭 Lightbox
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxOpen])

  const typeLabel = useMemo(() => {
    if (!current) return null
    if (current.type === "live") return t("photoTriage.livePair")
    if (current.type === "video") return t("photoTriage.video")
    return t("photoTriage.photo")
  }, [current, t])

  const sizeLabel = current?.size_bytes
    ? t("photoTriage.sizeFormat", { size: (current.size_bytes / 1024 / 1024).toFixed(1) })
    : ""

  const dragIds = `${controller.multiSel.length ? controller.multiSel.join(",") : (current?.id ?? "")}`
  // 对齐 py lightbox：fit= max 100% contain；100% = w:100%；200% = w:200%（超宽可滚动查看）
  const zoomClass =
    zoom === 1 ? "w-full max-w-none" : zoom === 2 ? "w-[200%] max-w-none" : "max-h-full max-w-full"

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 cursor-zoom-in items-center justify-center overflow-hidden bg-black p-3 select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isVideo) setLightboxOpen(true)
        }}
      >
        {isVideo && videoSrc ? (
          <video
            key={videoSrc}
            ref={videoRef}
            src={toAssetUrl(videoSrc) ?? undefined}
            controls
            className="max-h-full max-w-full object-contain"
          />
        ) : imageSrc ? (
          <img
            key={imageSrc}
            src={toAssetUrl(imageSrc) ?? undefined}
            alt={current?.stem}
            draggable
            onDragStart={(e) => {
              if (!dragIds) return
              e.dataTransfer.setData("text/plain", dragIds)
              e.dataTransfer.effectAllowed = "move"
              usePhotoTriageStore.getState().setDragActive(true)
              // WKWebView 显式指定跟随图（对齐 py 在浏览器里的默认快照）
              setDragImage(e, e.currentTarget, 240)
            }}
            onDragEnd={() => usePhotoTriageStore.getState().setDragActive(false)}
            onClick={() => setLightboxOpen(true)}
            className="max-h-full max-w-full cursor-zoom-in object-contain"
          />
        ) : (
          <p className="text-muted-foreground text-sm select-none">{t("photoTriage.loading")}</p>
        )}
      </div>

      {/* 拖拽中淡化 meta 栏聚焦待选文件夹（py file-dragging .meta；不能动预览区本身——它是拖拽源祖先） */}
      <div
        className={cn(
          "bg-background flex flex-wrap items-center gap-2 border-t px-3 py-2 transition-opacity",
          dragActive && "pointer-events-none opacity-35",
        )}
      >
        <span className="text-muted-foreground max-w-[30%] min-w-0 truncate text-xs">
          {current
            ? prettyPath(current.image || current.video || current.stem)
            : t("photoTriage.none")}
        </span>
        {typeLabel ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px]",
              current?.type === "live"
                ? "border border-amber-400 text-amber-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {typeLabel}
          </span>
        ) : null}
        {sizeLabel ? <span className="text-muted-foreground text-xs">{sizeLabel}</span> : null}
        <span className="ml-auto flex items-center gap-1.5">
          {current?.type === "live" && !deleted ? (
            <Button variant="outline" size="sm" onClick={controller.toggleLive}>
              {liveView === "motion" ? (
                <Square size={13} className="mr-1" />
              ) : (
                <Play size={13} className="mr-1" />
              )}
              {liveView === "motion" ? t("photoTriage.viewStatic") : t("photoTriage.viewMotion")}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => nav(-1)} disabled={!visible.length}>
            {t("photoTriage.prev")}
          </Button>
          {deleted ? (
            <Button variant="outline" size="sm" onClick={() => current && onRestore([current.id])}>
              {t("photoTriage.restore")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
                onClick={() => current && markCurrent("keep")}
                disabled={!current}
              >
                {t("photoTriage.keepShortcut")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-500 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                onClick={() => current && markCurrent("drop")}
                disabled={!current}
              >
                {t("photoTriage.dropShortcut")}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => nav(1)} disabled={!visible.length}>
            {t("photoTriage.next")}
          </Button>
          <span className="text-muted-foreground ml-1 hidden w-16 text-right text-[11px] sm:inline">
            {currentIndex >= 0 ? currentIndex + 1 : 0}/{visible.length}
          </span>
        </span>
      </div>

      {/* Lightbox：fit → 100% → 200% */}
      {lightboxOpen && imageSrc ? (
        <div
          className="fixed inset-0 z-[80] cursor-zoom-out overflow-auto bg-black/90"
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName
            if (tag !== "IMG") setLightboxOpen(false)
          }}
        >
          <div className="flex min-h-full items-center justify-center p-6">
            <img
              src={toAssetUrl(imageSrc) ?? undefined}
              alt={current?.stem}
              onClick={(e) => {
                e.stopPropagation()
                setZoom((z) => ((z + 1) % 3) as Zoom)
              }}
              className={cn("object-contain select-none", zoomClass)}
            />
          </div>
          <button
            type="button"
            aria-label={t("photoTriage.closeLightbox")}
            className="fixed top-4 right-4 z-[81] rounded bg-black/50 px-3 py-1.5 text-white"
            onClick={() => setLightboxOpen(false)}
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  )
})
