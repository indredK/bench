/**
 * Batch refresh partial behavior test / 批量刷新 partial 行为测试 (A1-8):
 *   refreshAll 3 成功 + 2 失败 → 失败账号保留旧数据、账号区域错误条出现；
 *   Retry 后失败账号恢复、区域错误清除。
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAccountManagerController } from "@/features/account-manager/hooks/useAccountManagerController"
import {
  DEFAULT_LOGIN_DETECTION,
  type RelayStation,
  type StationAccount,
} from "@/lib/tauri/types/account-manager"

const mocks = vi.hoisted(() => ({
  listStations: vi.fn(),
  listAllAccounts: vi.fn(),
  getAccountManagerCapabilities: vi.fn(),
  refreshAll: vi.fn(),
  refreshStation: vi.fn(),
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: {
    getAccountManagerCapabilities: mocks.getAccountManagerCapabilities,
    listStations: mocks.listStations,
    listAllAccounts: mocks.listAllAccounts,
    refreshAll: mocks.refreshAll,
    refreshStation: mocks.refreshStation,
  },
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(async () => () => undefined),
}))

vi.mock("@/platform/capabilities", () => ({
  canUseTauriWindow: vi.fn(() => false),
  canUseDesktopFeatures: vi.fn(() => false),
}))

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: vi.fn(async () => null) },
}))

vi.mock("@/platform/dialog", () => ({
  openPlatformDialog: vi.fn(async () => null),
  savePlatformDialog: vi.fn(async () => null),
}))

const noop = () => undefined

function makeStation(id: string): RelayStation {
  return {
    id,
    remark: `station-${id}`,
    website: `https://${id}.test`,
    createdAt: "2026-07-14 08:00",
    loginDetection: DEFAULT_LOGIN_DETECTION,
    authProfile: null,
  }
}

function makeAccount(id: string, stationId: string, username: string): StationAccount {
  return {
    id,
    stationId,
    username,
    notes: "",
    phone: null,
    tgAccount: null,
    linkedAccount: null,
    inviteLink: null,
    loginMethods: [],
    status: "ready",
    lastLoginAt: null,
    lastRefreshedAt: "2026-01-01 00:00",
    createdAt: "2026-07-14 08:00",
    hasPassword: false,
  }
}

const stations = [makeStation("a")]
const accounts = [
  makeAccount("a1", "a", "u1"),
  makeAccount("a2", "a", "u2"),
  makeAccount("a3", "a", "u3"),
  makeAccount("a4", "a", "u4"),
  makeAccount("a5", "a", "u5"),
]

const capabilities = {
  credentialStore: { status: "supported" },
  isolatedWebview: { status: "supported" },
  cookieSession: { status: "supported" },
  webStorage: { status: "supported" },
  indexedDb: { status: "supported" },
  networkProxy: { status: "partial" },
  deepLink: { status: "supported" },
}

function refreshed(id: string, username: string): StationAccount {
  return { ...makeAccount(id, "a", username), lastRefreshedAt: "2026-09-03 12:00" }
}

beforeEach(() => {
  mocks.listStations.mockResolvedValue(stations)
  mocks.listAllAccounts.mockResolvedValue(accounts)
  mocks.getAccountManagerCapabilities.mockResolvedValue(capabilities)
  mocks.refreshAll.mockReset()
  mocks.refreshStation.mockReset()
})

describe("account-manager batch refresh partial (A1-8)", () => {
  it("keeps failed accounts on stale data, surfaces the region error and recovers after retry", async () => {
    const partialReport = {
      total: 5,
      succeeded: [refreshed("a1", "u1"), refreshed("a2", "u2"), refreshed("a3", "u3")],
      failed: [
        { accountId: "a4", error: { code: "STORE_FAIL", message: "boom-4" } },
        { accountId: "a5", error: { code: "STORE_FAIL", message: "boom-5" } },
      ],
    }
    mocks.refreshAll.mockResolvedValueOnce(partialReport)

    const { result } = renderHook(() => useAccountManagerController())

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.stations).toHaveLength(1))
    expect(result.current.accounts.find((a) => a.id === "a4")?.lastRefreshedAt).toBe(
      "2026-01-01 00:00",
    )

    await act(async () => {
      await result.current.handleRefreshAll()
    })

    // 成功账号被更新，失败账号保留旧数据
    expect(result.current.accounts.find((a) => a.id === "a1")?.lastRefreshedAt).toBe(
      "2026-09-03 12:00",
    )
    expect(result.current.accounts.find((a) => a.id === "a4")?.lastRefreshedAt).toBe(
      "2026-01-01 00:00",
    )
    expect(result.current.accounts.find((a) => a.id === "a5")?.lastRefreshedAt).toBe(
      "2026-01-01 00:00",
    )
    // 区域错误出现且可重试
    expect(result.current.regionErrors.account).not.toBeNull()
    expect(result.current.regionErrors.account?.retry).toBeTypeOf("function")

    // 重试：这次全部成功
    mocks.refreshAll.mockResolvedValueOnce({
      total: 5,
      succeeded: [
        refreshed("a1", "u1"),
        refreshed("a2", "u2"),
        refreshed("a3", "u3"),
        refreshed("a4", "u4"),
        refreshed("a5", "u5"),
      ],
      failed: [],
    })

    await act(async () => {
      result.current.retryRegion("account")
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.regionErrors.account).toBeNull())
    expect(result.current.accounts.find((a) => a.id === "a4")?.lastRefreshedAt).toBe(
      "2026-09-03 12:00",
    )
    expect(result.current.accounts.find((a) => a.id === "a5")?.lastRefreshedAt).toBe(
      "2026-09-03 12:00",
    )
  })

  it("writes a persistent account-region error when refreshAll rejects", async () => {
    mocks.refreshAll.mockRejectedValueOnce({ code: "INTERNAL", message: "ipc down" })

    const { result } = renderHook(() => useAccountManagerController())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleRefreshAll().catch(noop)
    })

    await waitFor(() => expect(result.current.regionErrors.account).not.toBeNull())
    // 手动关闭后清除
    act(() => {
      result.current.dismissRegionError("account")
    })
    expect(result.current.regionErrors.account).toBeNull()
  })
})
