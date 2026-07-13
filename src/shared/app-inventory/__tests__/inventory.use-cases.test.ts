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

  it("coalesces concurrent refresh requests into one IPC scan", async () => {
    let resolveScan: (value: AppScanResult) => void = () => {}
    const scan = vi.fn(
      () =>
        new Promise<AppScanResult>((resolve) => {
          resolveScan = resolve
        }),
    )
    const repository = {
      scanInstalledApps: scan,
      launchApp: vi.fn(async () => {}),
      revealAppInFinder: vi.fn(async () => {}),
      listenToProgress: vi.fn(async () => () => {}),
    } as unknown as AppInventoryRepository
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
})
