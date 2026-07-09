/**
 * Use Cases / 业务编排: compose repository calls; 只组合数据层调用.
 * Clean Space 业务编排。
 */
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { listenToPlatformEvent } from "@/platform/events"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import type { CleanupProgressItem } from "@/features/clean-space/store"
import { canCleanStorageItem } from "@/features/clean-space/lib/cleanable"
import { addMacOsRemainderCategory } from "@/features/clean-space/lib/mac-os-remainder"
import * as repository from "@/features/clean-space/services/clean-space.repository"
import { getErrorMessage } from "@/lib/tauri/errors"
import type { StorageCategory, StorageItem, ScanStartPayload } from "@/lib/tauri/types/clean-space"

/** Track active listeners to prevent duplicate registrations on rescan. */
let activeUnlisteners: (() => void)[] = []

export async function loadOverview() {
  const store = useCleanSpaceStore.getState()

  // Re-entry guard: a scan is already in flight — ignore subsequent triggers
  // (e.g. user double-clicks "Scan" while streaming scan is still active).
  if (store.isScanning) return

  store.setScanError(null)

  // Clean up any previous listeners before registering new ones
  for (const unlisten of activeUnlisteners) unlisten()
  activeUnlisteners = []

  try {
    // Set up event listeners BEFORE triggering the scan
    const unlistenStart = await listenToPlatformEvent<ScanStartPayload>(
      TAURI_EVENTS.cleanSpace.scanStart,
      (event) => {
        const { disk_total_bytes, disk_used_bytes } = event.payload
        useCleanSpaceStore.getState().initStreamScan(disk_total_bytes, disk_used_bytes)
      },
    )

    const unlistenCategory = await listenToPlatformEvent<StorageCategory>(
      TAURI_EVENTS.cleanSpace.scanCategory,
      (event) => {
        const category = event.payload
        const store = useCleanSpaceStore.getState()
        // Compute macOS remainder (business logic lives in lib/, not store)
        const nextOverview = addMacOsRemainderCategory(store.overview, store.scanDiskInfo, category)
        if (nextOverview) {
          store.setOverview(nextOverview)
        } else {
          // First category or no disk info yet: simple append
          store.addScannedCategory(category)
        }
      },
    )

    const unlistenComplete = await listenToPlatformEvent<void>(
      TAURI_EVENTS.cleanSpace.scanComplete,
      () => {
        useCleanSpaceStore.getState().finishStreamScan()
      },
    )

    activeUnlisteners = [unlistenStart, unlistenCategory, unlistenComplete]

    // Trigger the streaming scan (runs in Rust, emits events)
    await repository.scanStorageStream()
  } catch (err) {
    const msg = getErrorMessage(err)
    useCleanSpaceStore.getState().setScanError(msg)
    useCleanSpaceStore.getState().setIsScanning(false)
    // Clean up on error
    for (const unlisten of activeUnlisteners) unlisten()
    activeUnlisteners = []
  }
}

export async function loadRecords() {
  try {
    const records = await repository.getCleanupRecords()
    useCleanSpaceStore.getState().setRecords(records)
  } catch (err) {
    // Log instead of silently wiping records — file corruption should be visible
    console.warn(
      "[clean-space] loadRecords failed, keeping existing records:",
      getErrorMessage(err),
    )
  }
}

/**
 * Execute a batch cleanup of the given items, streaming progress into the store
 * and recording the result when finished. Caller is only responsible for
 * collecting the user's selection and closing the confirm UI.
 *
 * The progress log captures a wall-clock timestamp per entry so the UI does
 * not have to recompute time at render (which would make all entries share
 * the same "now" value on each re-render).
 */
export async function executeBatchCleanup(category: StorageCategory, items: StorageItem[]) {
  const store = useCleanSpaceStore.getState()
  const cleanableItems = items.filter(canCleanStorageItem)
  if (cleanableItems.length === 0) return

  store.setIsCleaning(true)

  const paths = new Set(cleanableItems.map((i) => i.path))
  const highCount = cleanableItems.filter((i) => i.risk_level === "high").length
  const totalBytes = cleanableItems.reduce((s, i) => s + i.size_bytes, 0)

  store.setCleanupProgress({
    active: true,
    total: cleanableItems.length,
    done: 0,
    currentItem: "",
    logs: [],
    finished: false,
    result: null,
  })

  try {
    let done = 0
    const logs: CleanupProgressItem[] = []

    for (const item of cleanableItems) {
      useCleanSpaceStore.getState().setCleanupProgress({ currentItem: item.name })

      const cleanupItems = [
        {
          id: item.id,
          category_id: item.category_id,
          command: item.command,
          path: item.path,
          size_bytes: item.size_bytes,
        },
      ]
      let status: "ok" | "warn" = "ok"
      try {
        await repository.executeCategoryCleanup(cleanupItems)
      } catch (err) {
        status = "warn"
        console.warn(
          `[clean-space] cleanup failed for "${item.name}" (${item.path}):`,
          getErrorMessage(err),
        )
      }

      done++
      logs.push({
        name: item.name,
        size_bytes: item.size_bytes,
        risk_level: item.risk_level,
        status: item.risk_level === "high" ? "warn" : status,
        timestamp: Date.now(),
      })
      useCleanSpaceStore.getState().setCleanupProgress({ done, logs: [...logs] })
    }

    store.addRecord({
      id: `cleanup-${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
      title: category.name,
      scope: category.id,
      items: done,
      freed_bytes: totalBytes,
      high_risk_count: highCount,
      status: highCount > 0 ? "warn" : "ok",
    })

    useCleanSpaceStore.getState().setCleanupProgress({
      finished: true,
      result: { items: done, freedBytes: totalBytes, paths: paths.size, highCount },
    })

    // Optimistic UI update: remove cleaned items from the category immediately
    // so the list feels responsive. The full overview refresh runs in the
    // background to reconcile any discrepancies (e.g. items whose size changed
    // between scan and cleanup).
    const cleanedIds = cleanableItems.map((i) => i.id)
    store.removeCleanedItems(category.id, cleanedIds, totalBytes)

    // Refresh overview in the background so freed space is reflected across
    // all categories. Failure here is non-fatal: the cleanup already succeeded
    // and the optimistic update already updated the current category.
    ;(async () => {
      try {
        const data = await repository.scanStorageOverview()
        useCleanSpaceStore.getState().setOverview(data)
      } catch (err) {
        console.warn("[clean-space] post-cleanup overview refresh failed:", getErrorMessage(err))
      }
    })()
  } finally {
    store.setIsCleaning(false)
  }
}
