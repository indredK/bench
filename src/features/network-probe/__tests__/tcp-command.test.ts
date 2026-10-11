import { describe, expect, it } from "vitest"
import { formatTcpConnectCommand } from "../utils/tcp-command"

describe("formatTcpConnectCommand", () => {
  it("quotes host input as a single safe command argument", () => {
    expect(formatTcpConnectCommand("lab'\nnode", 443)).toBe(
      `tcpConnect(local, "lab'\\nnode", 443, 3000)`,
    )
  })

  it.each([Number.NaN, 0, 65_536, 1.5])("uses a placeholder for invalid port %s", (port) => {
    expect(formatTcpConnectCommand("example.com", port)).toBe(
      'tcpConnect(local, "example.com", …, 3000)',
    )
  })
})
