/**
 * ThumbnailStrip / 缩略图条（react-virtual 虚拟滚动 + grid 多列自适应）.
 * 对齐 Python `triage.html`：
 * - 缩略图区 `grid-template-columns: repeat(auto-fill, minmax(96px, 1fr))`，列数随
 *   面板宽度自适应，卡片保持正方形（宽度 = 高度），不被压缩变形；
 * - 按行虚拟化 + overscan，滚动到哪渲染到哪，图片按需生成（ensureProxy + inflight 去重）；
 * - 缩略图加载完成（成功/失败）上报 store.loadedIds，驱动分组刻度填充；
 * - 分组头、留/删标记、已删角标、实况/视频 badge、多选、拖动到文件夹卡片。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import type { PhotoItem } from "@/lib/tauri/types/photo-triage"
import { usePhotoTriageStore, type TriageMark } from "@/features/photo-triage/store"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"
import { toAssetUrl } from "@/features/photo-triage/hooks/usePhotoTriageController"
import * as uc from "@/features/photo-triage/services/photo-triage.use-cases"

const MIN_COL = 96 // 对齐 Python `.thumb` 最小列宽
const GAP = 8
const HEADER_HEIGHT = 28

/** 单张缩略图：正方形卡片，代理加载完成后上报 loaded；无代理时占位。 */
const ProxyThumb = memo(function ProxyThumb({
  item,
  mark,
  active,
  deleted,
  picked,
  onSelect,
}: {
  item: PhotoItem
  mark: TriageMark | null
  active: boolean
  deleted: boolean
  picked: boolean
  onSelect: (e: React.MouseEvent, id: string) => void
}) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)

  const proxyKind = item.type === "video" ? ("poster" as const) : ("image" as const)

  const markLoaded = useCallback(() => {
    usePhotoTriageStore.getState().setItemLoaded(item.id)
  }, [item.id])

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    if (deleted) {
      // 已删条目也标为处理完，刻度不会卡在半格
      markLoaded()
      return
    }
    void uc.ensureProxy(item.id, proxyKind).then((path) => {
      // 成功或失败都算处理完（刻度填充依据，对齐 Python loadedIds）；失败仅占位，不阻塞滚动
      markLoaded()
      if (!cancelled && path) setSrc(path)
    })
    return () => {
      cancelled = true
    }
  }, [item.id, proxyKind, deleted, markLoaded])

  return (
    <div
      data-id={item.id}
      onClick={(e) => onSelect(e, item.id)}
      draggable
      onDragStart={(e) => {
        // 多选包含当前项时拖动整组；否则拖动当前项（对齐 Python dataTransfer ids）
        const s = usePhotoTriageStore.getState()
        const ids = s.multiSel.includes(item.id) ? s.multiSel : [item.id]
        e.dataTransfer.setData("text/plain", ids.join(","))
        e.dataTransfer.effectAllowed = "move"
      }}
      title={item.stem}
      className={cn(
        "group/cell relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-black transition-colors",
        active && "border-primary",
        !active && mark === "keep" && "border-emerald-500",
        !active && mark === "drop" && "border-red-500",
        picked && "border-primary shadow-[0_0_0_2px_rgba(76,141,255,.55)]",
        deleted && "opacity-35",
      )}
    >
      {src ? (
        <img
          src={toAssetUrl(src) ?? undefined}
          alt={item.stem}
          loading="lazy"
          onLoad={markLoaded}
          onError={markLoaded}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight break-all">
          {item.stem}
        </div>
      )}
      {item.type === "live" ? (
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
          {t("photoTriage.live")}
        </span>
      ) : item.type === "video" ? (
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
          ▶
        </span>
      ) : null}
      {deleted ? (
        <span className="absolute right-1 bottom-1 rounded bg-red-500 px-1 text-[10px] text-white">
          {t("photoTriage.deleted")}
        </span>
      ) : mark ? (
        <span
          className={cn(
            "absolute top-1 right-1 text-xs font-bold",
            mark === "keep" ? "text-emerald-400" : "text-red-400",
          )}
        >
          {mark === "keep" ? t("photoTriage.keep") : t("photoTriage.drop")}
        </span>
      ) : null}
      {picked ? (
        <span className="bg-primary absolute bottom-1 left-1 flex size-4 items-center justify-center rounded-full text-[10px] text-white">
          ✓
        </span>
      ) : null}
    </div>
  )
})

/** 虚拟行模型：分组头行 或 网格行（一段连续条目，折成 cols 列）。 */
interface ModelRow {
  key: string
  kind: "header" | "grid"
  folder?: string
  items?: PhotoItem[]
}

export function ThumbnailStrip({
  controller,
  onRegisterJump,
}: {
  controller: PhotoTriageController
  onRegisterJump?: (fn: (folder: string) => void) => void
}) {
  const { currentId, multiSel, selectCurrent, sel, deletedSet, rows } = controller
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [panelWidth, setPanelWidth] = useState(0)

  // 面板宽度自适应 → 列数（对齐 Python `repeat(auto-fill, minmax(96px, 1fr))`）
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setPanelWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cols = panelWidth > 0 ? Math.max(1, Math.floor((panelWidth + GAP) / (MIN_COL + GAP))) : 3
  const colWidth = cols > 0 ? (panelWidth - GAP * (cols - 1)) / cols : MIN_COL
  const gridRowHeight = Math.max(colWidth, 96)

  // 把（分组头 + 条目）序列切成「分组头行 / 网格行」
  const model = useMemo<ModelRow[]>(() => {
    const out: ModelRow[] = []
    let buffer: PhotoItem[] = []
    const flush = () => {
      if (!buffer.length) return
      for (let i = 0; i < buffer.length; i += cols) {
        const chunk = buffer.slice(i, i + cols)
        out.push({ key: `g:${out.length}`, kind: "grid", items: chunk })
      }
      buffer = []
    }
    for (const row of rows) {
      if (row.kind === "header") {
        flush()
        out.push({ key: `h:${row.folder}`, kind: "header", folder: row.folder })
      } else {
        buffer.push(row.item)
      }
    }
    flush()
    return out
  }, [rows, cols])

  const estimateRowSize = useCallback(
    (index: number) => (model[index]?.kind === "header" ? HEADER_HEIGHT : gridRowHeight),
    [model, gridRowHeight],
  )

  const virtualizer = useVirtualizer({
    count: model.length,
    getScrollElement: () => rootRef.current,
    estimateSize: estimateRowSize,
    getItemKey: (index) => model[index]?.key ?? index,
    overscan: 8,
  })

  // 宽度/列数变化后重算尺寸
  useEffect(() => {
    virtualizer.measure()
  }, [gridRowHeight, virtualizer])

  const virtualRows = virtualizer.getVirtualItems()

  // 分组索引条跳转回调注册
  useEffect(() => {
    if (!onRegisterJump) return
    onRegisterJump((folder: string) => {
      const idx = model.findIndex((m) => m.kind === "header" && m.folder === folder)
      if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "start" })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, virtualizer])

  if (!rows.length) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t("photoTriage.errorEmptyFilter")}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative h-full overflow-auto">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((vr) => {
          const m = model[vr.index]
          if (m.kind === "header") {
            return (
              <div
                key={m.key}
                className="bg-background/95 text-primary sticky top-0 z-10 flex h-7 w-full items-center gap-1 border-b border-dashed px-2 text-xs font-semibold"
                style={{ transform: `translateY(${vr.start}px)` }}
              >
                📁 {m.folder === "." ? t("photoTriage.root") : m.folder}
              </div>
            )
          }
          const gridItems = m.items ?? []
          return (
            <div
              key={m.key}
              className="absolute top-0 left-0 flex w-full px-1.5"
              style={{ transform: `translateY(${vr.start}px)`, height: gridRowHeight, gap: GAP }}
            >
              {gridItems.map((it) => {
                const deleted = !!it.deleted || deletedSet.has(it.id)
                const mark = deleted ? null : (sel[it.id] ?? null)
                return (
                  <div key={it.id} className="min-w-0 shrink-0" style={{ width: colWidth }}>
                    <ProxyThumb
                      item={it}
                      mark={mark}
                      active={it.id === currentId}
                      deleted={deleted}
                      picked={multiSel.includes(it.id)}
                      onSelect={(e, id) =>
                        selectCurrent(id, {
                          toggle: e.metaKey || e.ctrlKey,
                          range: e.shiftKey,
                        })
                      }
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
