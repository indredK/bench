import { describe, expect, it } from "vitest"
import { redactCommandTarget } from "@/features/network-probe/redact-command-target"

describe("redactCommandTarget", () => {
  it("keeps a bare host or IP readable", () => {
    expect(redactCommandTarget("example.com")).toBe("example.com")
    expect(redactCommandTarget("2001:4860:4860::8888")).toBe("2001:4860:4860::8888")
  })

  it("removes URL credentials and redacts paths, query values, and fragments", () => {
    expect(
      redactCommandTarget(
        "https://alice:secret@example.com/private/reset-token?api_key=secret#session",
      ),
    ).toBe("https://example.com/[redacted-path]?[redacted]#[redacted]")
  })

  it("redacts WSS endpoints and malformed or multiline inputs", () => {
    expect(
      redactCommandTarget("wss://user:password@agent.example:8443/v1/health?token=secret"),
    ).toBe("wss://agent.example:8443/[redacted-path]?[redacted]")
    expect(redactCommandTarget("https://[broken?token=secret")).toBe("<redacted>")
    expect(redactCommandTarget("example.com\nforged log line")).toBe("<redacted>")
  })
})
