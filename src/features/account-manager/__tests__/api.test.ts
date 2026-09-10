import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  drainAuthProxyRequest,
  exportRelayData,
  getAccountManagerCapabilities,
  getAuthProxyInboxStatus,
  listAccountLogs,
  matchStationsByUrl,
  openLoginWindow,
  proxyLogin,
  proxyLoginNewAccount,
  refreshAll,
  retryAccountManagerInit,
  setAccountRefreshSchedule,
} from "@/lib/tauri/commands/account-manager"
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"

const { invokeTauriCommand } = vi.hoisted(() => ({
  invokeTauriCommand: vi.fn(),
}))

vi.mock("@/lib/tauri/invoke", () => ({
  invokeTauriCommand,
}))

describe("account-manager commands", () => {
  beforeEach(() => {
    invokeTauriCommand.mockReset()
    invokeTauriCommand.mockResolvedValue({
      stationCount: 1,
      accountCount: 2,
      mode: "sanitized",
    })
  })

  it("exports sanitized relay data by default", async () => {
    await exportRelayData("/tmp/demo.json")

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.exportRelayData, {
      path: "/tmp/demo.json",
      mode: "sanitized",
    })
  })

  it("starts proxy login with an opaque one-time ticket", async () => {
    await proxyLogin("acct-1", "ticket-1")

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.proxyLogin, {
      accountId: "acct-1",
      ticketId: "ticket-1",
    })
  })

  it("creates proxy accounts from the ticket canonical host", async () => {
    await proxyLoginNewAccount("ticket-2", "alice")

    expect(invokeTauriCommand).toHaveBeenCalledWith(
      TAURI_COMMANDS.accountManager.proxyLoginNewAccount,
      { ticketId: "ticket-2", username: "alice" },
    )
  })

  it("requests a structured refresh report", async () => {
    await refreshAll()

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.refreshAll)
  })

  it("reads and drains the auth proxy inbox without sending renderer URL data", async () => {
    await getAuthProxyInboxStatus()
    await drainAuthProxyRequest()

    expect(invokeTauriCommand).toHaveBeenNthCalledWith(
      1,
      TAURI_COMMANDS.accountManager.getAuthProxyInboxStatus,
    )
    expect(invokeTauriCommand).toHaveBeenNthCalledWith(
      2,
      TAURI_COMMANDS.accountManager.drainAuthProxyRequest,
    )
  })

  it("reads backend capabilities without renderer-supplied platform claims", async () => {
    await getAccountManagerCapabilities()

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.getCapabilities)
  })

  it("delegates init retry to the backend re-init command", async () => {
    await retryAccountManagerInit()

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.retryInit)
  })

  it("saves a refresh schedule with a null clearing payload", async () => {
    await setAccountRefreshSchedule("acct-1", null)

    expect(invokeTauriCommand).toHaveBeenCalledWith(
      TAURI_COMMANDS.accountManager.setAccountRefreshSchedule,
      { accountId: "acct-1", schedule: null },
    )
  })

  it("lists account logs scoped to one account", async () => {
    await listAccountLogs("acct-1")

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.listAccountLogs, {
      accountId: "acct-1",
    })
  })

  it("matches stations by a pasted URL", async () => {
    await matchStationsByUrl("https://github.com/login")

    expect(invokeTauriCommand).toHaveBeenCalledWith(
      TAURI_COMMANDS.accountManager.matchStationsByUrl,
      {
        url: "https://github.com/login",
      },
    )
  })

  it("opens a login window with an explicit URL for existing accounts", async () => {
    await openLoginWindow("acct-1", "https://github.com/login/oauth/authorize")

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.openLoginWindow, {
      accountId: "acct-1",
      url: "https://github.com/login/oauth/authorize",
    })
  })
})
