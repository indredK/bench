/**
 * Navigation Layout Registry / 导航布局注册表.
 *
 * The three display forms (sidebar / top-tab / bottom-tab) render the SAME
 * feature tree from `features/registry` — only the position/orientation of the
 * navigation differs. The feature data (paths, labels, icons) is never altered
 * here; this module only describes the available forms.
 *
 * Adding a new layout later:
 *   1. Add a `NavigationLayoutId` literal here + a `NAVIGATION_LAYOUTS` entry.
 *   2. Render it in `components/layout/NavigationShell.tsx`.
 *   3. Add i18n labels (`navigationLayout.<id>`).
 */
import { PanelLeft, PanelTop, PanelBottom, type LucideIcon } from "lucide-react"

export type NavigationLayoutId = "sidebar" | "top-tab" | "bottom-tab"

export const NAVIGATION_LAYOUT_STORAGE_KEY = "navigationLayout"
export const DEFAULT_NAVIGATION_LAYOUT: NavigationLayoutId = "sidebar"

export interface NavigationLayoutDescriptor {
  readonly id: NavigationLayoutId
  readonly labelKey: string
  readonly icon: LucideIcon
}

export const NAVIGATION_LAYOUTS: readonly NavigationLayoutDescriptor[] = [
  {
    id: "sidebar",
    labelKey: "navigationLayout.sidebar",
    icon: PanelLeft,
  },
  {
    id: "top-tab",
    labelKey: "navigationLayout.topTab",
    icon: PanelTop,
  },
  {
    id: "bottom-tab",
    labelKey: "navigationLayout.bottomTab",
    icon: PanelBottom,
  },
] as const

const NAVIGATION_LAYOUTS_BY_ID = Object.fromEntries(
  NAVIGATION_LAYOUTS.map((l) => [l.id, l]),
) as Record<NavigationLayoutId, NavigationLayoutDescriptor>

export function getNavigationLayoutDescriptor(id: NavigationLayoutId): NavigationLayoutDescriptor {
  return NAVIGATION_LAYOUTS_BY_ID[id] ?? NAVIGATION_LAYOUTS_BY_ID[DEFAULT_NAVIGATION_LAYOUT]
}

export function isValidNavigationLayoutId(value: unknown): value is NavigationLayoutId {
  return typeof value === "string" && value in NAVIGATION_LAYOUTS_BY_ID
}
