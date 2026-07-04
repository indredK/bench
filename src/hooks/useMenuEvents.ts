/**
 * Shell Hook / 壳层 Hook: share shell hooks only; 只放壳层通用 Hook.
 */
import { useEffect } from "react"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { listenToPlatformEvent } from "@/platform/events"

type MenuEventHandler = (menuItemId: string) => void

const menuHandlers: Record<string, MenuEventHandler> = {}

export function useMenuEvent(menuItemId: string, handler: MenuEventHandler) {
  useEffect(() => {
    menuHandlers[menuItemId] = handler

    return () => {
      delete menuHandlers[menuItemId]
    }
  }, [menuItemId, handler])
}

export function useInitMenuEvents() {
  useEffect(() => {
    // The listen call is async (it lazy-loads @tauri-apps/api/event). If the
    // component unmounts before the promise resolves, `unlisten` is still
    // undefined and the cleanup is a no-op — but the listener still ends up
    // registered, leaking. Use a `cancelled` flag so a late-arriving
    // unlisten can be invoked immediately (#104).
    let cancelled = false
    let unlisten: (() => void) | undefined

    void listenToPlatformEvent<string>(TAURI_EVENTS.menu.event, (event) => {
      const handler = menuHandlers[event.payload]
      if (handler) {
        handler(event.payload)
      }
    }).then((fn) => {
      if (cancelled) {
        fn()
      } else {
        unlisten = fn
      }
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
