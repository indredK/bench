import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = vi.hoisted(() => ({
  createEphemeralAccount: vi.fn(),
  deleteAccount: vi.fn(),
  openLoginWindow: vi.fn(),
  matchStationsByUrl: vi.fn(),
}))

vi.mock("@/features/account-manager/services/account-manager.repository", () => ({
  accountManagerRepository: repository,
}))

vi.mock("@/platform/capabilities", () => ({
  canUseTauriWindow: vi.fn(() => true),
}))

import { accountManagerUseCases } from "@/features/account-manager/services/account-manager.use-cases"

const ephemeralAccount = { id: "eph-test", accountType: "ephemeral" }

describe("accountManagerUseCases quick login", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repository.createEphemeralAccount.mockResolvedValue(ephemeralAccount)
    repository.deleteAccount.mockResolvedValue({ status: "complete", metadataDeleted: true })
    repository.openLoginWindow.mockResolvedValue(undefined)
    repository.matchStationsByUrl.mockResolvedValue([])
  })

  it.each([
    "https://user:secret@example.com/login",
    "https://user@example.com/login",
    "ftp://example.com/login",
    "javascript:alert(1)",
    "file:/etc/passwd",
    "not a url",
  ])("rejects unsafe or malformed URL before any IPC: %s", async (url) => {
    await expect(accountManagerUseCases.quickLogin(url, "synthetic")).rejects.toMatchObject({
      code: "INVALID_LOGIN_URL",
    })
    expect(repository.createEphemeralAccount).not.toHaveBeenCalled()
    expect(repository.openLoginWindow).not.toHaveBeenCalled()
    expect(repository.matchStationsByUrl).not.toHaveBeenCalled()
  })

  it("normalizes a valid HTTP(S) address and opens it", async () => {
    const result = await accountManagerUseCases.quickLogin("example.com/login", "synthetic")

    expect(result.normalized).toBe("https://example.com/login")
    expect(repository.createEphemeralAccount).toHaveBeenCalledWith(
      "https://example.com/login",
      "synthetic",
      null,
    )
    expect(repository.openLoginWindow).toHaveBeenCalledWith("eph-test")
  })

  it("removes the just-created account when opening its login window fails", async () => {
    const openError = { code: "STORE_FAIL", message: "synthetic open failure" }
    repository.openLoginWindow.mockRejectedValue(openError)

    await expect(accountManagerUseCases.quickLogin("example.com", "synthetic")).rejects.toBe(
      openError,
    )
    expect(repository.deleteAccount).toHaveBeenCalledWith("eph-test")
  })

  it("surfaces a localized cleanup error if the ephemeral account remains", async () => {
    repository.openLoginWindow.mockRejectedValue(new Error("synthetic open failure"))
    repository.deleteAccount.mockResolvedValue({ status: "partial", metadataDeleted: false })

    await expect(
      accountManagerUseCases.quickLogin("example.com", "synthetic"),
    ).rejects.toMatchObject({ code: "QUICK_LOGIN_CLEANUP_FAILED" })
  })

  it("rejects credentials before station matching", async () => {
    await expect(
      accountManagerUseCases.matchStations("https://user:secret@example.com"),
    ).rejects.toMatchObject({
      code: "INVALID_LOGIN_URL",
    })
    expect(repository.matchStationsByUrl).not.toHaveBeenCalled()
  })
})
