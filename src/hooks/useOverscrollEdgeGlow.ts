import { useCallback, useEffect, useRef, type RefObject } from "react"
import { useReducedMotion } from "motion/react"
import { edgeGlowOpacity } from "@/lib/scroll-rubber-band"

/** 末次滚轮后多久开始 CSS 淡出（ms） */
const RELEASE_DELAY_MS = 160
/** 滚轮 delta → 虚拟 overscroll 系数（仅驱动光效强度） */
const WHEEL_TO_OVERSCROLL = 0.78

function paintGlow(
  wrapper: HTMLElement | null,
  overscroll: number,
  viewport: number,
  dragging: boolean,
) {
  if (!wrapper) return

  const top = overscroll > 0 ? edgeGlowOpacity(overscroll, viewport) : 0
  const bottom = overscroll < 0 ? edgeGlowOpacity(overscroll, viewport) : 0

  if (dragging) {
    wrapper.setAttribute("data-glow-active", "")
  } else {
    wrapper.removeAttribute("data-glow-active")
  }

  wrapper.style.setProperty("--scroll-glow-top", top.toFixed(3))
  wrapper.style.setProperty("--scroll-glow-bottom", bottom.toFixed(3))
}

/**
 * Overscroll edge glow — minimal JS (wheel + CSS vars); visuals handled by CSS.
 */
export function useOverscrollEdgeGlow(enabled: boolean, wrapperRef: RefObject<HTMLElement | null>) {
  const shouldReduceMotion = useReducedMotion() ?? false
  const active = enabled && !shouldReduceMotion

  const overscrollRef = useRef(0)
  const viewportRef = useRef(400)
  const pendingDeltaRef = useRef(0)
  const wheelRafRef = useRef(0)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRefStable = useRef(wrapperRef)
  wrapperRefStable.current = wrapperRef

  const fadeOut = useCallback(() => {
    overscrollRef.current = 0
    paintGlow(wrapperRefStable.current.current, 0, viewportRef.current, false)
  }, [])

  const scheduleFadeOut = useCallback(() => {
    if (holdTimerRef.current != null) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null
      fadeOut()
    }, RELEASE_DELAY_MS)
  }, [fadeOut])

  const flushWheelBatch = useCallback(() => {
    wheelRafRef.current = 0
    const delta = pendingDeltaRef.current
    if (delta === 0) return

    pendingDeltaRef.current = 0
    overscrollRef.current += delta
    paintGlow(wrapperRefStable.current.current, overscrollRef.current, viewportRef.current, true)
    scheduleFadeOut()
  }, [scheduleFadeOut])

  const queueGlow = useCallback(
    (wheelDelta: number, viewport: number) => {
      if (!active) return

      viewportRef.current = viewport
      pendingDeltaRef.current += wheelDelta * WHEEL_TO_OVERSCROLL

      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(flushWheelBatch)
      }
    },
    [active, flushWheelBatch],
  )

  useEffect(
    () => () => {
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current)
      if (holdTimerRef.current != null) clearTimeout(holdTimerRef.current)
      fadeOut()
    },
    [fadeOut],
  )

  const handleNativeWheel = useCallback(
    (e: WheelEvent) => {
      const scrollEl = e.currentTarget
      if (!(scrollEl instanceof HTMLElement) || !active) return

      const atTop = scrollEl.scrollTop <= 0
      const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1

      if (e.deltaY < 0 && atTop) {
        queueGlow(-e.deltaY, scrollEl.clientHeight)
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.deltaY > 0 && atBottom) {
        queueGlow(-e.deltaY, scrollEl.clientHeight)
        e.preventDefault()
        e.stopPropagation()
      }
    },
    [active, queueGlow],
  )

  return { handleNativeWheel, active }
}
