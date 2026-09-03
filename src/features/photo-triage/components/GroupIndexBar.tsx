/**
 * GroupIndexBar / 分组索引条（Fast Scroller）.
 * 对齐 Python `triage.html` §分组索引条：
 * - 刻度为水平小条（9×2px），`flex:1` 均分高度（min-height 6px），分组再多也全部可见；
 * - 加载进度从两端向中心渐变填充（`--p` 0..1，橙=加载中，填满变绿）；
 * - hover / 当前分组（随滚动同步）：变蓝加宽（13×3px）；
 * - hover 立即显示 tooltip（portal 渲染到 body，fixed 定位在索引条右侧，不被裁剪）：
 *   文件夹名 + 未加载完刻度的「已加载/总数」（含 0/N，随加载实时刷新）；
 * - 点击刻度跳到对应分组。
 */
import { memo, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { groupFill, type HeaderRow } from "@/features/photo-triage/lib/grouping"
import { usePhotoTriageStore } from "@/features/photo-triage/store"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"

/** py 配色：加载中橙（--warn）、填满绿（--keep）、悬停/当前蓝（--accent）。 */
const C_WARN = "#ffb454"
const C_KEEP = "#2ecc71"
const C_ACCENT = "#4c8dff"

export const GroupIndexBar = memo(function GroupIndexBar({
  controller,
  onJumpToFolder,
}: {
  controller: PhotoTriageController
  onJumpToFolder: (folder: string) => void
}) {
  const { t } = useTranslation()
  const { rows } = controller
  const loadedIds = usePhotoTriageStore((s) => s.loadedIds)
  const currentFolder = usePhotoTriageStore((s) => s.currentFolder)
  const [hovered, setHovered] = useState<string | null>(null)
  /** tooltip 锚点（fixed 坐标，对齐 py gtip：贴索引条右侧、垂直居中于刻度） */
  const [tip, setTip] = useState<{ x: number; y: number; folder: string } | null>(null)

  const groups = useMemo(() => rows.filter((r): r is HeaderRow => r.kind === "header"), [rows])
  const loadedSet = useMemo(() => new Set(loadedIds), [loadedIds])
  const fill = useMemo(() => groupFill(rows, loadedSet), [rows, loadedSet])

  if (!groups.length) return null

  // tooltip 内容在渲染期从 fill 取值：悬停中随缩略图加载实时刷新（对齐 py refreshGtipProgress）
  const tipInfo = tip ? fill.get(tip.folder) : undefined

  return (
    <div
      className="bg-background/90 flex w-[18px] flex-none flex-col border-r"
      onMouseLeave={() => {
        setHovered(null)
        setTip(null)
      }}
    >
      {groups.map((g) => {
        const info = fill.get(g.folder)
        const total = info?.total ?? 0
        const loaded = info?.loaded ?? 0
        const p = total > 0 ? Math.min(1, Math.max(0, loaded / total)) : 0
        const active = hovered === g.folder || currentFolder === g.folder
        const name = g.folder === "." ? t("photoTriage.root") : g.folder
        const loading = loaded < total
        const label = `${name}${loading ? ` ${loaded}/${total}` : ""}`
        const fillColor = active ? C_ACCENT : C_WARN
        return (
          <button
            key={g.folder}
            type="button"
            aria-label={label}
            onClick={() => onJumpToFolder(g.folder)}
            onMouseEnter={(e) => {
              setHovered(g.folder)
              const r = e.currentTarget.getBoundingClientRect()
              setTip({ x: r.right + 8, y: r.top + r.height / 2, folder: g.folder })
            }}
            className="relative flex min-h-[6px] w-full flex-1 cursor-pointer items-center justify-center"
          >
            {/* 底轨（py ::before）：常态 9×2 弱化，hover/当前 13×3 蓝色 */}
            <span
              className={cn(
                "rounded-full transition-all",
                active ? "h-[3px] w-[13px] bg-[#4c8dff]" : "bg-muted-foreground/45 h-[2px] w-[9px]",
              )}
            />
            {/* 进度填充层（py ::after）：从两端向中心填充；填满纯绿，hover/当前变蓝 */}
            <span
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all"
              style={
                {
                  width: active ? 13 : 9,
                  height: active ? 3 : 2,
                  "--p": p.toFixed(4),
                  ...(p >= 1
                    ? { backgroundColor: active ? C_ACCENT : C_KEEP }
                    : {
                        background: `linear-gradient(90deg, ${fillColor} 0, ${fillColor} calc(var(--p)*50% - 1px), transparent calc(var(--p)*50%), transparent calc(100% - var(--p)*50%), ${fillColor} calc(100% - var(--p)*50% + 1px), ${fillColor} 100%)`,
                      }),
                } as React.CSSProperties & Record<"--p", string>
              }
            />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
      {/* hover tooltip：fixed 定位 portal 到 body（py gtip，不受容器裁剪，垂直位置钳制在视口内） */}
      {tip
        ? createPortal(
            <div
              className="bg-popover text-popover-foreground pointer-events-none fixed z-[99] max-w-[60vw] truncate rounded-md border px-2.5 py-1 text-xs shadow-md"
              style={{
                left: tip.x,
                top: Math.max(8, Math.min(tip.y, window.innerHeight - 34)),
                transform: "translateY(-50%)",
              }}
            >
              {tip.folder === "." ? t("photoTriage.root") : tip.folder}
              {tipInfo && tipInfo.loaded < tipInfo.total
                ? ` ${tipInfo.loaded}/${tipInfo.total}`
                : ""}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})
