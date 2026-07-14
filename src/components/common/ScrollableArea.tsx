/**
 * Scrollable content wrapper with overscroll edge glow feedback.
 * Use for any list, card grid, or scrollable panel in the main content area.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type WheelEvent,
} from "react"
import { cn } from "@/lib/utils"
import { useOverscrollEdgeGlow } from "@/hooks/useOverscrollEdgeGlow"

export interface ScrollableAreaProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  /** Render the scroll container as a different element (default: div) */
  as?: "div" | "nav"
  /** Classes on the outer relative wrapper that hosts glow overlays */
  wrapperClassName?: string
  /** When false, renders a plain scroll container without glow (e.g. tiny popovers) */
  edgeGlow?: boolean
  /** Bottom overscroll indicator dot (default: true) */
  showBottomDot?: boolean
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") ref(node)
      else (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

export const ScrollableArea = forwardRef<HTMLDivElement, ScrollableAreaProps>(
  function ScrollableArea(
    {
      children,
      className,
      wrapperClassName,
      edgeGlow: edgeGlowEnabled = true,
      showBottomDot = true,
      onWheel,
      as: ScrollTag = "div",
      ...props
    },
    forwardedRef,
  ) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const onWheelRef = useRef(onWheel)
    onWheelRef.current = onWheel

    const { handleNativeWheel, active } = useOverscrollEdgeGlow(edgeGlowEnabled, wrapperRef)

    useEffect(() => {
      const el = scrollRef.current
      if (!el) return

      const handler = (e: globalThis.WheelEvent) => {
        if (edgeGlowEnabled) handleNativeWheel(e)
        onWheelRef.current?.(e as unknown as WheelEvent<HTMLDivElement>)
      }

      el.addEventListener("wheel", handler, { passive: false })
      return () => el.removeEventListener("wheel", handler)
    }, [edgeGlowEnabled, handleNativeWheel])

    return (
      <div
        ref={wrapperRef}
        data-scroll-edge-glow={active ? "" : undefined}
        className={cn("relative min-h-0", wrapperClassName)}
      >
        <ScrollTag
          ref={mergeRefs(scrollRef, forwardedRef)}
          className={cn("min-h-0 overflow-y-auto overscroll-none", className)}
          {...props}
        >
          {children}
        </ScrollTag>

        {active && showBottomDot && <span aria-hidden className="scroll-edge-glow-dot" />}
      </div>
    )
  },
)
