import { describe, expect, it } from "vitest"
import {
  capabilityPlatformLabelKey,
  capabilityPrivilegeLabelKey,
} from "@/features/network-probe/utils/capability-presentation"

describe("network capability presentation keys", () => {
  it.each([
    ["macos", "networkProbe.caps.platform.macos"],
    ["windows", "networkProbe.caps.platform.windows"],
    ["linux", "networkProbe.caps.platform.linux"],
    ["future-os", "networkProbe.caps.platform.unknown"],
  ])("maps platform %s to a localized label", (platform, expected) => {
    expect(capabilityPlatformLabelKey(platform)).toBe(expected)
  })

  it.each([
    ["none", "networkProbe.caps.privilege.none"],
    ["user", "networkProbe.caps.privilege.user"],
    ["admin", "networkProbe.caps.privilege.elevated"],
    ["root", "networkProbe.caps.privilege.elevated"],
    ["elevated", "networkProbe.caps.privilege.elevated"],
    ["future-level", "networkProbe.caps.privilege.unknown"],
  ])("maps privilege %s to a localized label", (privilege, expected) => {
    expect(capabilityPrivilegeLabelKey(privilege)).toBe(expected)
  })
})
