import { describe, expect, it } from "vitest"
import { getProbeNodeDisplayLabel } from "@/features/network-probe/utils/probe-node-label"

describe("getProbeNodeDisplayLabel", () => {
  it("uses the localized label for the built-in local node", () => {
    expect(getProbeNodeDisplayLabel("local", "This Mac", "本机")).toBe("本机")
    expect(getProbeNodeDisplayLabel("local", "This Mac", "This Mac")).toBe("This Mac")
  })

  it("preserves names configured for remote nodes", () => {
    expect(getProbeNodeDisplayLabel("remote-agent", "Office Mac", "本机")).toBe("Office Mac")
  })
})
