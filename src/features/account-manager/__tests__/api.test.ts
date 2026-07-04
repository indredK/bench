import { beforeEach, describe, expect, it, vi } from "vitest"
import { exportRelayData } from "@/lib/tauri/commands/account-manager"
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

  it("allows opting into encrypted full export", async () => {
    await exportRelayData("/tmp/demo.json", "encryptedFull")

    expect(invokeTauriCommand).toHaveBeenCalledWith(TAURI_COMMANDS.accountManager.exportRelayData, {
      path: "/tmp/demo.json",
      mode: "encryptedFull",
    })
  })
})
