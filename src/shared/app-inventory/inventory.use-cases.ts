/** Single owner for inventory refresh, launch, and reveal orchestration. */
import {
  appInventoryRepository,
  type AppInventoryRepository,
} from "@/shared/app-inventory/inventory.repository"
import { useAppInventoryStore } from "@/shared/app-inventory/store"
import { getErrorMessage } from "@/lib/tauri/errors"
import { canUseDesktopFeatures } from "@/platform/capabilities"

let activeRefresh: Promise<
  ReturnType<AppInventoryRepository["scanInstalledApps"]> extends Promise<infer T> ? T : never
> | null = null

export function createAppInventoryUseCases(
  repository: AppInventoryRepository = appInventoryRepository,
  isAvailable: () => boolean = canUseDesktopFeatures,
) {
  const refresh = async () => {
    if (activeRefresh) return activeRefresh
    if (!isAvailable()) {
      throw new Error("INVENTORY_PLATFORM_UNSUPPORTED")
    }

    const previous = useAppInventoryStore.getState().snapshot
    useAppInventoryStore.getState().setState({
      status: previous ? "refreshing" : "loading",
      progress: {
        taskId: "pending",
        current: 0,
        completed: 0,
        total: null,
        stage: "scanningDirectories",
        cancellable: true,
      },
      error: null,
      stale: false,
    })

    activeRefresh = (async () => {
      let unlisten: (() => void) | null = null
      try {
        try {
          unlisten = await repository.listenToProgress((progress) => {
            useAppInventoryStore.getState().setState({ progress })
          })
        } catch {
          // Progress events are optional; the command result remains authoritative.
        }
        const snapshot = await repository.scanInstalledApps()
        useAppInventoryStore.getState().setState({
          snapshot,
          status: snapshot.complete === false ? "partial" : "ready",
          progress: null,
          error: null,
          stale: false,
        })
        return snapshot
      } catch (error) {
        useAppInventoryStore.getState().setState({
          status: "error",
          progress: null,
          error: getErrorMessage(error),
          stale: previous !== null,
        })
        throw error
      } finally {
        unlisten?.()
        activeRefresh = null
      }
    })()
    return activeRefresh
  }

  return {
    refresh,
    /**
     * 启动后首次进入页面的恢复路径: 只读取上一次会话持久化的快照,
     * 不触发扫描; 无缓存时保持未扫描状态, 由用户显式触发 refresh。
     */
    ensureLoaded() {
      const { snapshot } = useAppInventoryStore.getState()
      if (snapshot) return Promise.resolve(snapshot)
      if (!isAvailable()) return Promise.resolve(null)
      return (async () => {
        const cached = await repository.getCachedAppInventory()
        // 缓存读取期间用户可能已手动触发扫描: 以进行中的新鲜数据为准, 不回写覆盖。
        const current = useAppInventoryStore.getState()
        if (current.snapshot || current.status === "loading" || current.status === "refreshing") {
          return current.snapshot
        }
        if (!cached) return null
        useAppInventoryStore.getState().setState({
          snapshot: cached,
          status: cached.complete === false ? "partial" : "ready",
          progress: null,
          error: null,
          stale: true,
        })
        return cached
      })()
    },
    launch(appId: string) {
      return repository.launchApp(appId)
    },
    reveal(appId: string) {
      return repository.revealAppInFinder(appId)
    },
    cancel() {
      return repository.cancelAppInventoryScan()
    },
  }
}

export const appInventoryUseCases = createAppInventoryUseCases()
