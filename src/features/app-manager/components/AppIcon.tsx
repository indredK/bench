/**
 * Feature View / 功能视图: render from props/state; 只负责功能界面.
 */
import { useEffect, useState } from "react"
import { appManagerUseCases } from "@/features/app-manager/services/app-manager.use-cases"
import { canUseDesktopFeatures } from "@/platform/capabilities"

interface AppIconProps {
  iconBase64: string | null
  appId?: string
  size?: number
  className?: string
}

// LRU cap. The icon cache previously grew without bound; on a machine with
// 800+ apps each base64 icon (~10-30KB) could pin several megabytes
// indefinitely, and re-scans never released the entries (#070). The cap is
// generous (covers most users in one shot) and we rely on Map insertion-order
// to evict the oldest entries.
const ICON_CACHE_CAP = 500
const MAX_CONCURRENT_LOADS = 8
const iconCache = new Map<string, string | null>()
const iconRequests = new Map<string, Promise<string | null>>()
let activeLoadCount = 0
const pendingLoadQueue: Array<() => void> = []

function runNextPendingLoad() {
  if (activeLoadCount >= MAX_CONCURRENT_LOADS) return
  const next = pendingLoadQueue.shift()
  if (next) next()
}

function rememberIcon(appId: string, icon: string | null) {
  if (iconCache.has(appId)) {
    iconCache.delete(appId)
  } else if (iconCache.size >= ICON_CACHE_CAP) {
    const oldest = iconCache.keys().next().value
    if (oldest !== undefined) iconCache.delete(oldest)
  }
  iconCache.set(appId, icon)
}

function readIcon(appId: string): string | null | undefined {
  if (!iconCache.has(appId)) return undefined
  const value = iconCache.get(appId) ?? null
  iconCache.delete(appId)
  iconCache.set(appId, value)
  return value
}

function loadIcon(appId: string) {
  const cached = readIcon(appId)
  if (cached !== undefined) return Promise.resolve(cached)

  const existing = iconRequests.get(appId)
  if (existing) return existing

  const startLoad = () => {
    activeLoadCount++
    const request = appManagerUseCases
      .loadAppIconBase64(appId)
      .then((icon) => {
        rememberIcon(appId, icon)
        return icon
      })
      .catch(() => {
        rememberIcon(appId, null)
        return null
      })
      .finally(() => {
        iconRequests.delete(appId)
        activeLoadCount--
        runNextPendingLoad()
      })
    iconRequests.set(appId, request)
    return request
  }

  if (activeLoadCount < MAX_CONCURRENT_LOADS) {
    return startLoad()
  }

  const queued = new Promise<string | null>((resolve) => {
    pendingLoadQueue.push(() => {
      startLoad().then(resolve)
    })
  })
  iconRequests.set(appId, queued)
  return queued
}

export function preloadAppIcons(apps: { appId?: string }[]) {
  for (const app of apps) {
    if (app.appId) {
      loadIcon(app.appId)
    }
  }
}

export function AppIcon({ iconBase64, appId, size = 24, className }: AppIconProps) {
  const [loadedIcon, setLoadedIcon] = useState<string | undefined>(() =>
    appId ? (readIcon(appId) ?? undefined) : undefined,
  )
  const icon = iconBase64 ?? loadedIcon

  useEffect(() => {
    if (iconBase64 || !appId || !canUseDesktopFeatures()) return
    let cancelled = false
    const cached = readIcon(appId)
    if (cached !== undefined) {
      setLoadedIcon(cached ?? undefined)
      return
    }
    void loadIcon(appId).then((nextIcon) => {
      if (!cancelled) setLoadedIcon(nextIcon ?? undefined)
    })
    return () => {
      cancelled = true
    }
  }, [appId, iconBase64])

  return (
    <div style={{ width: size, height: size }} className={className}>
      {icon && (
        <img
          src={`data:image/png;base64,${icon}`}
          alt=""
          width={size}
          height={size}
          className={className}
        />
      )}
      {!icon && (
        <span
          className="text-muted-foreground flex h-full w-full items-center justify-center text-xs font-semibold"
          aria-hidden="true"
        >
          {(appId?.slice(-2) ?? "?").toUpperCase()}
        </span>
      )}
    </div>
  )
}
