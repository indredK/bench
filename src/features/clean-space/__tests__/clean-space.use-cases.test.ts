import { beforeEach, describe, expect, it, vi } from "vitest"
import { waitFor } from "@testing-library/react"

import { executeBatchCleanup } from "@/features/clean-space/services/clean-space.use-cases"
import * as repository from "@/features/clean-space/services/clean-space.repository"
import { useCleanSpaceStore } from "@/features/clean-space/store"
import type {
  CategoryCleanupResult,
  StorageCategory,
  StorageItem,
} from "@/lib/tauri/types/clean-space"

vi.mock("@/features/clean-space/services/clean-space.repository", () => ({
  executeCategoryCleanup: vi.fn(),
  scanStorageOverview: vi.fn(),
  addCleanupRecord: vi.fn(),
}))

function item(id: string, size: number): StorageItem {
  return {
    id,
    name: id,
    category_id: "downloads",
    risk_level: "safe",
    size_bytes: size,
    command: "allowlisted-by-backend-only",
    is_cleanable: true,
    protection_kind: "none",
    protection_reason: "",
    path: `/tmp/${id}`,
    files: "1",
    reason: "test",
    priority: "P1",
    score: 1,
  }
}

function result(
  id: string,
  status: "cleaned" | "rejected",
  freedBytes: number,
): CategoryCleanupResult {
  const cleaned = status === "cleaned"
  return {
    success: cleaned,
    freed_bytes: freedBytes,
    items_cleaned: cleaned ? 1 : 0,
    items_failed: cleaned ? 0 : 1,
    aborted: false,
    results: [
      {
        id,
        status,
        freed_bytes: freedBytes,
        error_code: cleaned ? null : "FORBIDDEN_PATH",
      },
    ],
  }
}

describe("executeBatchCleanup", () => {
  const cleanedItem = item("cleaned", 4_096)
  const failedItem = item("failed", 8_192)
  const category: StorageCategory = {
    id: "downloads",
    name: "Downloads",
    color: "red",
    total_bytes: 12_288,
    items: [cleanedItem, failedItem],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useCleanSpaceStore.setState(
      {
        ...useCleanSpaceStore.getInitialState(),
        overview: { disk_total_bytes: 100_000, categories: [category] },
      },
      true,
    )
  })

  it("keeps failed items and counts only backend-confirmed freed bytes", async () => {
    vi.mocked(repository.executeCategoryCleanup).mockImplementation(async (items) => {
      const id = items[0]?.id ?? ""
      return id === cleanedItem.id ? result(id, "cleaned", 2_048) : result(id, "rejected", 0)
    })
    vi.mocked(repository.scanStorageOverview).mockResolvedValue({
      disk_total_bytes: 100_000,
      categories: [{ ...category, total_bytes: failedItem.size_bytes, items: [failedItem] }],
    })

    await executeBatchCleanup(category, category.items)

    const progress = useCleanSpaceStore.getState().cleanupProgress
    expect(progress.result).toEqual({
      items: 1,
      failed: 1,
      freedBytes: 2_048,
      paths: 1,
      highCount: 0,
    })
    expect(progress.logs.map((entry) => entry.status)).toEqual(["ok", "failed"])
    expect(useCleanSpaceStore.getState().records[0]).toMatchObject({
      items: 1,
      freed_bytes: 2_048,
      status: "warn",
    })
    expect(repository.addCleanupRecord).toHaveBeenCalledWith(
      expect.objectContaining({ items: 1, freed_bytes: 2_048 }),
    )

    await waitFor(() => {
      const remaining = useCleanSpaceStore.getState().overview?.categories[0]?.items ?? []
      expect(remaining.map((entry) => entry.id)).toEqual([failedItem.id])
    })
  })

  it("does not log item names, paths, or backend messages when cleanup throws", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.mocked(repository.executeCategoryCleanup).mockRejectedValue({
      code: "IO_ERROR",
      message: `failed at ${failedItem.path}`,
    })
    vi.mocked(repository.scanStorageOverview).mockResolvedValue({
      disk_total_bytes: 100_000,
      categories: [category],
    })

    await executeBatchCleanup(category, [failedItem])

    expect(warning).toHaveBeenCalledWith("[clean-space] cleanup failed", {
      itemId: failedItem.id,
      errorCode: "IO_ERROR",
    })
    const logged = JSON.stringify(warning.mock.calls)
    expect(logged).not.toContain(failedItem.path)
    expect(logged).not.toContain(`failed at ${failedItem.path}`)
  })
})
