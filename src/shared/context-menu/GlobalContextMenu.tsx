/**
 * Shared Interaction / 共享交互: own generic menus; 只负责通用右键菜单能力.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { contextMenuManager } from "./ContextMenuManager"
import type { ContextMenuState } from "./types"

interface GlobalContextMenuProps {
  children: ReactNode
  className?: string
}

/**
 * Global context menu provider.
 *
 * Wraps the application content and intercepts all right-click events
 * via event delegation. Matches the click target against registered
 * context menus and renders the appropriate menu at the click position.
 *
 * Falls back to the default menu when no registered menu matches.
 */
export function GlobalContextMenu({ children, className }: GlobalContextMenuProps) {
  const [state, setState] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    open: false,
    matchedId: null,
    context: null,
    menu: { id: "__empty__", items: [] },
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Adjust position to keep menu within viewport
  const getAdjustedPosition = useCallback((rawX: number, rawY: number) => {
    const menu = menuRef.current
    if (!menu) return { x: rawX, y: rawY }

    const rect = menu.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    let x = rawX
    let y = rawY

    // If menu would overflow right edge, flip to left of cursor
    if (rawX + rect.width + margin > vw) {
      x = rawX - rect.width
    }
    // If menu would overflow bottom, flip above cursor
    if (rawY + rect.height + margin > vh) {
      y = rawY - rect.height
    }

    // Clamp to viewport
    x = Math.max(margin, Math.min(x, vw - rect.width - margin))
    y = Math.max(margin, Math.min(y, vh - rect.height - margin))

    return { x, y }
  }, [])

  // Subscribe to manager state changes
  useEffect(() => {
    const unsub = contextMenuManager.subscribe((newState) => {
      if (newState.open) {
        // We'll adjust position after a microtask so the menu has rendered
        setState((prev) => {
          // Keep previous position, will be adjusted after render
          return { ...newState, x: prev.x, y: prev.y }
        })
        // After menu renders, adjust position
        requestAnimationFrame(() => {
          const adjusted = getAdjustedPosition(newState.x, newState.y)
          setState({ ...newState, ...adjusted })
        })
      } else {
        setState(newState)
      }
    })
    return unsub
  }, [getAdjustedPosition])

  // Close on click outside or Escape
  useEffect(() => {
    if (!state.open) return

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        contextMenuManager.close()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        contextMenuManager.close()
      }
    }
    const handleScroll = () => {
      contextMenuManager.close()
    }

    document.addEventListener("click", handleClick, true)
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("scroll", handleScroll, true)
    return () => {
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("scroll", handleScroll, true)
    }
  }, [state.open])

  // Intercept contextmenu events on the wrapper
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Let the manager process the event
    contextMenuManager.handleContextMenu(e.nativeEvent)
    e.preventDefault()
  }, [])

  return (
    <div ref={wrapperRef} className={className} onContextMenu={handleContextMenu}>
      {children}

      {/* Menu overlay */}
      {state.open && state.menu.items.length > 0 && (
        <div
          ref={menuRef}
          data-slot="context-menu-content"
          className={cn(
            "bg-popover text-popover-foreground fixed z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg",
            "animate-in fade-in-0 zoom-in-95",
          )}
          style={{
            left: state.x,
            top: state.y,
          }}
          role="menu"
          aria-orientation="vertical"
        >
          {state.menu.items.map((item, index) => {
            const prevItem = index > 0 ? state.menu.items[index - 1] : null

            return (
              <div key={item.id}>
                {/* Auto-separator when destructive follows non-destructive */}
                {prevItem && !prevItem.destructive && item.destructive && (
                  <div className="bg-border -mx-1.5 my-1 h-px" />
                )}
                <Button
                  variant="ghost"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick()
                    contextMenuManager.close()
                  }}
                  className={cn(
                    "flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm select-none",
                    "hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                    item.destructive && "text-red-600 hover:text-red-600",
                  )}
                  role="menuitem"
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="text-muted-foreground ml-auto text-xs tracking-widest">
                      {item.shortcut}
                    </span>
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
