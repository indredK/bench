/**
 * Integrated basic network view: one scroll surface with six navigable sections.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react"
import { ScrollableArea } from "@/components/common/ScrollableArea"

export interface BasicViewSection {
  id: string
  title: string
  content: ReactNode
}

interface BasicViewProps {
  sections: BasicViewSection[]
  initialSectionId?: string
  onActiveSectionChange?: (id: string) => void
}

export function focusBasicViewSection(id: string) {
  document.getElementById(`network-probe-basic-${id}`)?.focus({ preventScroll: true })
}

export function BasicView({ sections, initialSectionId, onActiveSectionChange }: BasicViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const initialSection = useRef(initialSectionId)
  // The remembered anchor is only for entering BasicView; active-section updates must not
  // repeatedly scroll the user back while the navigation state follows manual scrolling.
  const initialScrollApplied = useRef(false)
  const onActiveSectionChangeRef = useRef(onActiveSectionChange)
  onActiveSectionChangeRef.current = onActiveSectionChange

  const updateActiveSection = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller || sections.length === 0) return

    const sectionElements = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-basic-section]"),
    )
    if (sectionElements.length === 0) return

    const scrollerRect = scroller.getBoundingClientRect()
    const activationLine = scrollerRect.top + Math.min(96, scrollerRect.height * 0.25)
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    const active = atBottom
      ? sectionElements.at(-1)
      : (sectionElements.find((section) => {
          const rect = section.getBoundingClientRect()
          return rect.top <= activationLine && rect.bottom > activationLine
        }) ??
        [...sectionElements]
          .reverse()
          .find((section) => section.getBoundingClientRect().top <= activationLine) ??
        sectionElements[0])

    const activeId = active?.dataset.basicSection
    if (activeId) onActiveSectionChangeRef.current?.(activeId)
  }, [sections.length])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return

    let frame = 0
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateActiveSection)
    }

    const initialId = initialSection.current
    if (initialId && !initialScrollApplied.current) {
      const initialTarget = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-basic-section]"),
      ).find((section) => section.dataset.basicSection === initialId)
      if (initialTarget) {
        initialTarget.scrollIntoView?.({ behavior: "auto", block: "start" })
        initialScrollApplied.current = true
      }
    }

    scroller.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate)
    const content = contentRef.current
    const resizeObserver =
      content && typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null
    if (content) resizeObserver?.observe(content)
    scheduleUpdate()
    return () => {
      window.cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
      resizeObserver?.disconnect()
    }
  }, [updateActiveSection])

  return (
    <ScrollableArea
      ref={scrollRef}
      data-testid="network-probe-basic-scroller"
      wrapperClassName="flex min-h-0 min-w-0 flex-1"
      className="min-h-0 flex-1 pr-1 pb-2"
      showBottomDot={false}
    >
      <div ref={contentRef} className="mx-auto w-full max-w-5xl space-y-3 pb-3">
        {sections.map((section, index) => {
          const headingId = `network-probe-basic-${section.id}-heading`
          return (
            <section
              key={section.id}
              id={`network-probe-basic-${section.id}`}
              data-basic-section={section.id}
              aria-labelledby={headingId}
              tabIndex={-1}
              className="bg-card focus-visible:ring-ring scroll-mt-3 rounded-lg border p-3 focus-visible:ring-2 focus-visible:outline-none sm:p-4"
            >
              <div className="mb-3 flex items-center gap-2 border-b pb-2">
                <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 id={headingId} className="text-sm font-semibold">
                  {section.title}
                </h3>
              </div>
              {section.content}
            </section>
          )
        })}
      </div>
    </ScrollableArea>
  )
}
