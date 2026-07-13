/**
 * useNavigationLayout / 导航布局钩子.
 *
 * Reads the persisted layout choice and keeps every mounted copy in sync via a
 * window event — the same singleton-ish pattern used by `useWindowTheme`.
 */
import { useCallback, useEffect, useState } from "react"
import {
  DEFAULT_NAVIGATION_LAYOUT,
  NAVIGATION_LAYOUT_STORAGE_KEY,
  getNavigationLayoutDescriptor,
  isValidNavigationLayoutId,
  type NavigationLayoutId,
} from "@/lib/navigationLayout"
import { readStorageItem, writeStorageItem } from "@/platform/storage"

const NAV_LAYOUT_CHANGE_EVENT = "navigation-layout-change"

function readPersistedLayout(): NavigationLayoutId {
  const raw = readStorageItem(NAVIGATION_LAYOUT_STORAGE_KEY)
  if (isValidNavigationLayoutId(raw)) return raw
  return DEFAULT_NAVIGATION_LAYOUT
}

function notifyChange(next: NavigationLayoutId) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<NavigationLayoutId>(NAV_LAYOUT_CHANGE_EVENT, { detail: next }),
  )
}

export function useNavigationLayout() {
  const [layoutId, setLayoutIdState] = useState<NavigationLayoutId>(readPersistedLayout)

  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const handler = (event: Event) => {
      setLayoutIdState((event as CustomEvent<NavigationLayoutId>).detail)
    }
    window.addEventListener(NAV_LAYOUT_CHANGE_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(NAV_LAYOUT_CHANGE_EVENT, handler as EventListener)
    }
  }, [])

  const setLayoutId = useCallback((next: NavigationLayoutId) => {
    writeStorageItem(NAVIGATION_LAYOUT_STORAGE_KEY, next)
    notifyChange(next)
    setLayoutIdState(next)
  }, [])

  return {
    layoutId,
    setLayoutId,
    descriptor: getNavigationLayoutDescriptor(layoutId),
  }
}
