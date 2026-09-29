import { describe, expect, it } from "vitest"
import {
  getProbeMeasurementTargetDisplay,
  getProbeMeasurementTargetKey,
  isMatchingProbeMeasurement,
} from "../probe-comparison"

describe("probe comparison targets", () => {
  it("normalizes HTTP hosts and default ports while retaining query identity", () => {
    const measurement = {
      measurementType: "http" as const,
      target: "https://example.com/health?token=one",
    }

    expect(
      isMatchingProbeMeasurement(measurement, "http", "https://EXAMPLE.com:443/health?token=one"),
    ).toBe(true)
    expect(
      isMatchingProbeMeasurement(measurement, "http", "https://example.com/health?token=two"),
    ).toBe(false)
    expect(getProbeMeasurementTargetKey("http", "https://EXAMPLE.com:443/health?token=one")).toBe(
      "https://example.com/health?token=one",
    )
  })

  it("hides HTTP query strings from every target label", () => {
    expect(
      getProbeMeasurementTargetDisplay("http", "https://EXAMPLE.com:443/health?token=private"),
    ).toBe("https://example.com/health")
  })

  it("rejects credentials and fragments as HTTP comparison targets", () => {
    expect(getProbeMeasurementTargetKey("http", "https://user:pass@example.com/health")).toBeNull()
    expect(getProbeMeasurementTargetKey("http", "https://example.com/health#section")).toBeNull()
  })

  it("normalizes host targets, including IPv6", () => {
    expect(getProbeMeasurementTargetKey("dns", "Example.COM.")).toBe("example.com")
    expect(getProbeMeasurementTargetKey("ping", "2001:DB8::1")).toBe("[2001:db8::1]")
    expect(getProbeMeasurementTargetKey("dns", "example.com:53")).toBeNull()
  })
})
