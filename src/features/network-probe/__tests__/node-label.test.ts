import { describe, expect, it } from "vitest"
import { getProbeNodeDisplayLabel } from "@/features/network-probe/node-label"

describe("getProbeNodeDisplayLabel", () => {
  it("uses the active locale for the local node label", () => {
    const localNode = { kind: "local", label: "This Mac" }

    expect(getProbeNodeDisplayLabel(localNode, "本机")).toBe("本机")
    expect(getProbeNodeDisplayLabel(localNode, "This Mac")).toBe("This Mac")
  })

  it("preserves backend labels for non-local nodes", () => {
    expect(getProbeNodeDisplayLabel({ kind: "remote-agent", label: "Office Agent" }, "本机")).toBe(
      "Office Agent",
    )
  })
})
