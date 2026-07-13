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
    ensureLoaded() {
      const snapshot = useAppInventoryStore.getState().snapshot
      return snapshot ? Promise.resolve(snapshot) : refresh()
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
