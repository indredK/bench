/** Repository boundary for installed-application inventory IPC. */
import {
  cancelAppInventoryScan,
  getCachedAppInventory,
  launchApp,
  revealAppInFinder,
  scanInstalledApps,
} from "@/lib/tauri/commands/app-manager"
import { listenToPlatformEvent } from "@/platform/events"

import type { InventoryProgress } from "@/shared/app-inventory/store"

export const appInventoryRepository = {
  scanInstalledApps,
  cancelAppInventoryScan,
  getCachedAppInventory,
  launchApp,
  revealAppInFinder,
  listenToProgress(handler: (progress: InventoryProgress) => void) {
    return listenToPlatformEvent<InventoryProgress>("app-scan:progress", (event) => {
      handler(event.payload)
    })
  },
}

export type AppInventoryRepository = typeof appInventoryRepository
