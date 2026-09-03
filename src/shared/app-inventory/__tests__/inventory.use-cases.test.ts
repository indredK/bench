import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAppInventoryUseCases } from "@/shared/app-inventory/inventory.use-cases"
import type { AppInventoryRepository } from "@/shared/app-inventory/inventory.repository"
import { useAppInventoryStore } from "@/shared/app-inventory/store"
import type { AppScanResult } from "@/lib/tauri/types/app-manager"

const snapshot: AppScanResult = {
  apps: [],
  totalCount: 0,
  userCount: 0,
  systemCount: 0,
  scanTimeMs: 1,
  managedCount: 0,
  platformCapabilities: {
    brewAvailable: false,
    wingetAvailable: false,
    flatpakAvailable: false,
    snapAvailable: false,
    aptAvailable: false,
  },
  lastScanTime: 1,
  lastUpdateCheck: 0,
  revision: 1,
  complete: true,
  providers: [],
  warnings: [],
}

describe("app inventory use cases", () => {
  beforeEach(() => {
    useAppInventoryStore.setState({
      snapshot: null,
      status: "idle",
      progress: null,
      error: null,
      stale: false,
    })
  })

  function createRepository(overrides: Partial<AppInventoryRepository> = {}) {
    const repository = {
      scanInstalledApps: vi.fn(async () => snapshot),
      cancelAppInventoryScan: vi.fn(async () => true),
      getCachedAppInventory: vi.fn(async () => null),
      launchApp: vi.fn(async () => {}),
      revealAppInFinder: vi.fn(async () => {}),
      listenToProgress: vi.fn(async () => () => {}),
      ...overrides,
    } as unknown as AppInventoryRepository
    return {
      repository,
      scan: repository.scanInstalledApps,
      loadCache: repository.getCachedAppInventory,
    } as const
  }

  it("coalesces concurrent refresh requests into one IPC scan", async () => {
    let resolveScan: (value: AppScanResult) => void = () => {}
    const { repository, scan } = createRepository({
      scanInstalledApps: vi.fn(
        () =>
          new Promise<AppScanResult>((resolve) => {
            resolveScan = resolve
          }),
      ),
    })
    const useCases = createAppInventoryUseCases(repository, () => true)

    const first = useCases.refresh()
    const second = useCases.refresh()
    await Promise.resolve()
    expect(scan).toHaveBeenCalledTimes(1)

    resolveScan(snapshot)
    await expect(first).resolves.toEqual(snapshot)
    await expect(second).resolves.toEqual(snapshot)
    expect(useAppInventoryStore.getState().snapshot?.revision).toBe(1)
  })

  it("ensureLoaded restores persisted snapshot without triggering a scan", async () => {
    const persisted = { ...snapshot, revision: 42 }
    const { repository, scan, loadCache } = createRepository({
      getCachedAppInventory: vi.fn(async () => persisted),
    })
    const useCases = createAppInventoryUseCases(repository, () => true)

    await expect(useCases.ensureLoaded()).resolves.toEqual(persisted)
    expect(loadCache).toHaveBeenCalledTimes(1)
    expect(scan).not.toHaveBeenCalled()
    const state = useAppInventoryStore.getState()
    expect(state.snapshot?.revision).toBe(42)
    expect(state.status).toBe("ready")
    expect(state.stale).toBe(true)
  })

  it("ensureLoaded keeps the store unscanned when no cache exists", async () => {
    const { repository, scan } = createRepository({
      getCachedAppInventory: vi.fn(async () => null),
    })
    const useCases = createAppInventoryUseCases(repository, () => true)

    await expect(useCases.ensureLoaded()).resolves.toBeNull()
    expect(scan).not.toHaveBeenCalled()
    const state = useAppInventoryStore.getState()
    expect(state.snapshot).toBeNull()
    expect(state.status).toBe("idle")
  })

  it("ensureLoaded does not overwrite an in-flight refresh with stale cache", async () => {
    const persisted = { ...snapshot, revision: 42 }
    const { repository } = createRepository({
      scanInstalledApps: vi.fn(async () => snapshot),
      getCachedAppInventory: vi.fn(
        () =>
          new Promise<AppScanResult | null>((resolve) => {
            // 缓存读取慢于扫描启动, 模拟用户在恢复期间手动触发扫描。
            setTimeout(() => resolve(persisted), 10)
          }),
      ),
    })
    const useCases = createAppInventoryUseCases(repository, () => true)

    const hydration = useCases.ensureLoaded()
    const refreshed = await useCases.refresh()
    await expect(hydration).resolves.toEqual(snapshot)
    expect(useAppInventoryStore.getState().snapshot).toEqual(refreshed)
    expect(useAppInventoryStore.getState().stale).toBe(false)
  })
})
