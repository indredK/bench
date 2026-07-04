/**
 * Shared Interaction / 共享交互: own generic menus; 只负责通用右键菜单能力.
 */
import type { ReactNode } from "react"

export interface ContextMenuItemConfig {
  id: string
  label: ReactNode
  icon?: ReactNode
  shortcut?: string
  disabled?: boolean
  /**
   * When true, renders the label in a destructive style (red for delete/uninstall).
   */
  destructive?: boolean
  onClick: () => void
}

export interface ContextMenuConfig {
  id: string
  items: ContextMenuItemConfig[]
}

export interface ContextMenuRegistration {
  /** Unique identifier for this registration */
  id: string
  /** CSS selector to match DOM elements that should show this menu */
  selector: string
  /**
   * Given the event target element, resolve context data.
   * This is called when a right-click matches the selector so the menu
   * builder can access the underlying row data.
   */
  resolveContext: (target: HTMLElement) => unknown
  /**
   * Build menu items given the resolved context data.
   * If returns null the default menu is shown instead.
   */
  buildMenu: (ctx: unknown) => ContextMenuConfig | null
}

export interface ContextMenuState {
  /** Current x position */
  x: number
  /** Current y position */
  y: number
  /** Whether the menu is open */
  open: boolean
  /** Which registration matched, if any */
  matchedId: string | null
  /** Resolved context data */
  context: unknown
  /** Final menu config to render */
  menu: ContextMenuConfig
}
