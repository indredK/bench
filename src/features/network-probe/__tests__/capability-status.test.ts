import { describe, expect, it } from "vitest"
import { isNetworkProbeToolEnabled } from "@/features/network-probe/services/capability-status"

describe("network probe capability status", () => {
  it.each([
    ["supported", true],
    ["partial", true],
    ["degraded", true],
    ["unsupported", false],
    ["missing_pack", false],
    [undefined, false],
  ])("maps %s to enabled=%s", (status, enabled) => {
    expect(isNetworkProbeToolEnabled(status)).toBe(enabled)
  })
})
