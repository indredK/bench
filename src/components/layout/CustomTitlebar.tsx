/**
 * Layout UI / 布局 UI: own layout only; 只负责通用布局.
 */
import { useCallback, useEffect, useState } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { Minus, Maximize2, X, Pin, PinOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { canUseWindowControls } from "@/platform/window"
import { getCurrentAppWindow } from "@/platform/window"
import { Button } from "@/components/ui/button"
import { NotificationCenter } from "@/components/layout/notification-center/NotificationCenter"

interface CustomTitlebarProps {
  className?: string
}

type WindowControls = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  startDragging: () => Promise<void>
  startResizeDragging: (direction: WindowResizeDirection) => Promise<void>
  setAlwaysOnTop: (onTop: boolean) => Promise<void>
}

type WindowResizeDirection =
  "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West"

let cachedControls: WindowControls | null = null

async function getWindowControls(): Promise<WindowControls> {
  if (cachedControls) return cachedControls

  const win = await getCurrentAppWindow()

  cachedControls = {
    minimize: () => win.minimize(),
    toggleMaximize: () => win.toggleMaximize(),
    close: () => win.close(),
    startDragging: () => win.startDragging(),
    startResizeDragging: (direction) => win.startResizeDragging(direction),
    setAlwaysOnTop: (onTop) => win.setAlwaysOnTop(onTop),
  }

  return cachedControls
}

const desktop = canUseWindowControls()

export function CustomTitlebar({ className }: CustomTitlebarProps) {
  const { t } = useTranslation()
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  useEffect(() => {
    getCurrentAppWindow()
      .then((win) => {
        win
          .isAlwaysOnTop()
          .then(setAlwaysOnTop)
          .catch(() => {})
      })
      .catch(() => {})
  }, [])

  const handleToggleAlwaysOnTop = useCallback(async () => {
    try {
      const ctrl = await getWindowControls()
      const next = !alwaysOnTop
      await ctrl.setAlwaysOnTop(next)
      setAlwaysOnTop(next)
    } catch (e) {
      console.error("Failed to toggle always on top", e)
    }
  }, [alwaysOnTop])

  const handleMinimize = useCallback(async () => {
    try {
      const ctrl = await getWindowControls()
      await ctrl.minimize()
    } catch (e) {
      console.error("Failed to minimize window", e)
    }
  }, [])

  const handleToggleMaximize = useCallback(async () => {
    try {
      const ctrl = await getWindowControls()
      await ctrl.toggleMaximize()
    } catch (e) {
      console.error("Failed to toggle maximize window", e)
    }
  }, [])

  const handleClose = useCallback(async () => {
    try {
      const ctrl = await getWindowControls()
      await ctrl.close()
    } catch (e) {
      console.error("Failed to close window", e)
    }
  }, [])

  const handleDragStart = useCallback(async (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!desktop || event.button !== 0) return

    const target = event.target
    if (target instanceof Element && target.closest("[data-no-window-drag]")) {
      return
    }

    try {
      const ctrl = await getWindowControls()
      await ctrl.startDragging()
    } catch (e) {
      console.error("Failed to start window dragging", e)
    }
  }, [])

  const handleResizeStart = useCallback(
    async (event: ReactMouseEvent<HTMLDivElement>, direction: WindowResizeDirection) => {
      if (!desktop || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()

      try {
        const ctrl = await getWindowControls()
        await ctrl.startResizeDragging(direction)
      } catch (e) {
        console.error("Failed to start window resize dragging", e)
      }
    },
    [],
  )

  return (
    <div
      data-tauri-drag-region
      onMouseDown={(event) => {
        void handleDragStart(event)
      }}
      className={cn(
        "relative flex h-10 shrink-0 items-center justify-end",
        "select-none",
        "pr-3",
        className,
      )}
    >
      <div data-tauri-drag-region className="absolute inset-0" aria-hidden="true" />

      <div data-no-window-drag className="relative z-10 flex items-center gap-0.5">
        <NotificationCenter />

        {desktop && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              data-no-window-drag
              className={cn(alwaysOnTop && "text-primary hover:text-primary")}
              onClick={handleToggleAlwaysOnTop}
              title={t("titlebar.alwaysOnTop")}
              aria-label={t("titlebar.alwaysOnTop")}
            >
              {alwaysOnTop ? <Pin size={14} /> : <PinOff size={14} />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              data-no-window-drag
              onClick={handleMinimize}
              title={t("titlebar.minimize")}
              aria-label={t("titlebar.minimize")}
            >
              <Minus size={14} />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              data-no-window-drag
              onClick={handleToggleMaximize}
              title={t("titlebar.maximize")}
              aria-label={t("titlebar.maximize")}
            >
              <Maximize2 size={14} />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              data-no-window-drag
              className="hover:bg-red-500/20 hover:text-red-500"
              onClick={handleClose}
              title={t("titlebar.close")}
              aria-label={t("titlebar.close")}
            >
              <X size={14} />
            </Button>
          </>
        )}
      </div>

      {desktop && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[40]">
          <div
            onMouseDown={(event) => void handleResizeStart(event, "NorthWest")}
            className="pointer-events-auto absolute top-0 left-0 size-3 cursor-nwse-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "North")}
            className="pointer-events-auto absolute top-0 right-3 left-3 h-1.5 cursor-ns-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "NorthEast")}
            className="pointer-events-auto absolute top-0 right-0 size-3 cursor-nesw-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "West")}
            className="pointer-events-auto absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "East")}
            className="pointer-events-auto absolute top-3 right-0 bottom-3 w-1.5 cursor-ew-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "SouthWest")}
            className="pointer-events-auto absolute bottom-0 left-0 size-3 cursor-nesw-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "South")}
            className="pointer-events-auto absolute right-3 bottom-0 left-3 h-1.5 cursor-ns-resize"
          />
          <div
            onMouseDown={(event) => void handleResizeStart(event, "SouthEast")}
            className="pointer-events-auto absolute right-0 bottom-0 size-3 cursor-nwse-resize"
          />
        </div>
      )}
    </div>
  )
}
