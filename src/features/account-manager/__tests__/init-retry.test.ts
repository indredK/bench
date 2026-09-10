/**
 * loadInitialData 初始化自愈测试。
 *
 * 场景：启动时 init_state 失败（典型：macOS 钥匙串授权被拒）后，后端
 * ensure_ready() 令所有命令恒定失败 —— 重试前必须先调用 retryInit 触发
 * 后端重新初始化（重新弹出钥匙串授权），否则账号管理功能无法恢复。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = vi.hoisted(() => ({
  getAccountManagerCapabilities: vi.fn(),
  listStations: vi.fn(),
  listAllAccounts: vi.fn(),
  retryInit: vi.fn(),
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: repository,
}))

vi.mock("@/platform/capabilities", () => ({
  canUseTauriWindow: vi.fn(() => true),
  canUseTauriCommands: vi.fn(() => true),
}))

import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"

const INIT_FAIL = new Error("STORE_FAIL: state initialization failed")

/** 预构建已消化的 rejected promise，避免并行 Promise.all 中非首败成员触发 unhandled rejection。 */
function rejectedPromise(): Promise<never> {
  const promise = Promise.reject(INIT_FAIL)
  promise.catch(() => undefined)
  return promise
}

function queueFirstLoadFailure(capabilities: unknown) {
  repository.getAccountManagerCapabilities
    .mockImplementationOnce(() => rejectedPromise())
    .mockResolvedValueOnce(capabilities)
  repository.listStations.mockImplementationOnce(() => rejectedPromise()).mockResolvedValueOnce([])
  repository.listAllAccounts
    .mockImplementationOnce(() => rejectedPromise())
    .mockResolvedValueOnce([])
}

describe("accountManagerUseCases.loadInitialData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not call retryInit when the first load succeeds", async () => {
    const capabilities = { credentialStore: "keyring" }
    repository.getAccountManagerCapabilities.mockResolvedValue(capabilities)
    repository.listStations.mockResolvedValue([])
    repository.listAllAccounts.mockResolvedValue([])

    const [caps, stations, accounts] = await accountManagerUseCases.loadInitialData()

    expect(repository.retryInit).not.toHaveBeenCalled()
    expect(caps).toBe(capabilities)
    expect(stations).toEqual([])
    expect(accounts).toEqual([])
  })

  it("re-initializes via retryInit and reloads once after a failed load", async () => {
    const capabilities = { credentialStore: "keyring" }
    queueFirstLoadFailure(capabilities)
    repository.retryInit.mockResolvedValue(undefined)

    const [caps, stations, accounts] = await accountManagerUseCases.loadInitialData()

    expect(repository.retryInit).toHaveBeenCalledTimes(1)
    expect(caps).toBe(capabilities)
    expect(stations).toEqual([])
    expect(accounts).toEqual([])
  })

  it("propagates the failure when retryInit cannot recover", async () => {
    queueFirstLoadFailure({})
    repository.retryInit.mockRejectedValue(
      new Error("KEYRING_UNAVAILABLE: user denied the keychain prompt"),
    )

    await expect(accountManagerUseCases.loadInitialData()).rejects.toThrow("KEYRING_UNAVAILABLE")
    expect(repository.retryInit).toHaveBeenCalledTimes(1)
  })
})
