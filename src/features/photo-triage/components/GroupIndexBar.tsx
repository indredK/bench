/**
 * GroupIndexBar / 分组索引条（Fast Scroller）.
 * 对齐 Python `triage.html` §分组索引条：
 * - 刻度为水平小条，加载进度从两端向中心渐变填充（`--p` 0..1，橙=加载中，填满变绿，
 *   hover/当前变蓝加宽）；
 * - hover 立即显示文件夹名（原生 title 延迟太久），加载中的刻度额外显示「已加载/总数」，
 *   且随缩略图加载实时刷新；
 * - 点击刻度跳到对应分组（strip 内滚动，视口就近加载）。
 */
import { memo, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { groupFill, type HeaderRow } from "@/features/photo-triage/lib/grouping"
import { usePhotoTriageStore } from "@/features/photo-triage/store"
import type { PhotoTriageController } from "@/features/photo-triage/hooks/usePhotoTriageController"

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
  const [hovered, setHovered] = useState<string | null>(null)

  const groups = useMemo(() => rows.filter((r): r is HeaderRow => r.kind === "header"), [rows])
  const loadedSet = useMemo(() => new Set(loadedIds), [loadedIds])
  const fill = useMemo(() => groupFill(rows, loadedSet), [rows, loadedSet])

  if (!groups.length) return null

  return (
    <div
      className="bg-background/90 flex w-4 flex-none flex-col overflow-hidden rounded-sm border-r py-1"
      onMouseLeave={() => setHovered(null)}
    >
      {groups.map((g) => {
        const info = fill.get(g.folder)
        const p = info?.ratio ?? 0
        const loading = p > 0 && p < 1
        const label =
          groups.length === 1
            ? g.folder
            : `${g.folder === "." ? t("photoTriage.root") : g.folder}${loading ? ` ${info?.loaded}/${info?.total}` : ""}`
        return (
          <button
            key={g.folder}
            type="button"
            onClick={() => onJumpToFolder(g.folder)}
            onMouseEnter={() => setHovered(g.folder)}
            className={cn(
              "relative flex h-4 cursor-pointer items-center justify-center",
              hovered === g.folder && "z-40",
            )}
          >
            {/* 底轨 */}
            <span
              className={cn(
                "bg-muted-foreground/40 h-[3px] w-[10px] rounded-full transition-all",
                hovered === g.folder && "bg-primary h-[5px] w-[14px]",
              )}
            />
            {/* 进度填充层：从两端向中心渐变（calc(var(--p)*50%)），--p 为加载比例；填满后纯绿 */}
            <span
              className={cn(
                "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 transition-all",
                hovered === g.folder && "scale-[1.4]",
              )}
              style={
                {
                  width: hovered === g.folder ? 14 : 10,
                  height: hovered === g.folder ? 5 : 3,
                  margin: "0 auto",
                  borderRadius: 3,
                  "--p": Math.min(1, Math.max(0, p)).toFixed(4),
                  backgroundColor: p >= 1 ? "#2ecc71" : undefined,
                  background:
                    p >= 1
                      ? undefined
                      : p > 0
                        ? "linear-gradient(90deg, #ffb454 0, #ffb454 calc(var(--p)*50% - 1px), transparent calc(var(--p)*50%), transparent calc(100% - var(--p)*50%), #ffb454 calc(100% - var(--p)*50% + 1px), #ffb454 100%)"
                        : undefined,
                  opacity: p > 0 ? 1 : 0,
                } as React.CSSProperties
              }
            />
            {/* hover tooltip：立即显示文件夹名 + 加载进度 */}
            {hovered === g.folder ? (
              <span className="bg-popover text-popover-foreground pointer-events-none absolute top-1/2 left-5 z-50 max-w-[60vw] -translate-y-1/2 truncate rounded-md border px-2 py-1 text-[11px] shadow-md">
                {g.folder === "." ? t("photoTriage.root") : g.folder}
                {loading ? ` ${info?.loaded}/${info?.total}` : ""}
              </span>
            ) : null}
            <span className="sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
})
