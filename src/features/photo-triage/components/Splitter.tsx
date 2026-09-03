/**
 * Splitter / 缩略图栏宽度分隔条.
 * 对齐 Python `triage.html`：拖动分隔条调整缩略图栏宽度（多列自适应），
 * 双击恢复默认宽度。宽度随 localStorage 记忆。
 */
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { usePhotoTriageStore } from "@/features/photo-triage/store"

const STRIP_W_KEY = "photo-triage:stripW"
const STRIP_W_DEFAULT = 320
const STRIP_W_MIN = 220

export function loadStripWidth(): number {
  try {
    const raw = parseInt(localStorage.getItem(STRIP_W_KEY) ?? "", 10)
    return Number.isFinite(raw) && raw >= STRIP_W_MIN ? raw : STRIP_W_DEFAULT
  } catch {
    return STRIP_W_DEFAULT
  }
}

export function Splitter() {
  const { t } = useTranslation()
  const setStripWidth = usePhotoTriageStore((s) => s.setStripWidth)
  const dragging = useRef(false)

  const onMove = (e: MouseEvent) => {
    if (!dragging.current) return
    const max = Math.floor(window.innerWidth * 0.8)
    const next = Math.max(STRIP_W_MIN, Math.min(e.clientX ?? 0, max))
    setStripWidth(next)
  }
  const onUp = () => {
    dragging.current = false
    document.body.classList.remove("select-none", "cursor-col-resize")
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup", onUp)
    try {
      localStorage.setItem(STRIP_W_KEY, String(usePhotoTriageStore.getState().stripWidth))
    } catch {
      // ignore quota errors
    }
  }

  useEffect(
    () => () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.classList.add("select-none", "cursor-col-resize")
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  const handleDouble = () => {
    try {
      localStorage.removeItem(STRIP_W_KEY)
    } catch {
      // ignore
    }
    setStripWidth(STRIP_W_DEFAULT)
  }

  return (
    <div
      className={cn(
        "bg-muted/60 hover:bg-primary w-1.5 flex-none cursor-col-resize border-x transition-colors",
      )}
      title={t("photoTriage.splitterHint")}
      onMouseDown={handleDown}
      onDoubleClick={handleDouble}
    />
  )
}

export { STRIP_W_DEFAULT, STRIP_W_MIN }
