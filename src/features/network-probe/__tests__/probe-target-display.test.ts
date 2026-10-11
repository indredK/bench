import { describe, expect, it } from "vitest"
import { redactProbeTargetForDisplay } from "../utils/probe-target-display"

describe("redactProbeTargetForDisplay", () => {
  it("masks credentials, query values, and fragments while keeping the endpoint", () => {
    expect(
      redactProbeTargetForDisplay("https://user:secret@example.com/health?token=private#section"),
    ).toBe("https://example.com/health?…#…")
  })

  it("keeps plain hosts and masks malformed targets that may contain secrets", () => {
    expect(redactProbeTargetForDisplay("example.com")).toBe("example.com")
    expect(redactProbeTargetForDisplay("user:secret@example.com")).toBe("…")
    expect(redactProbeTargetForDisplay("https://invalid url?token=secret")).toBe("…")
  })
})
