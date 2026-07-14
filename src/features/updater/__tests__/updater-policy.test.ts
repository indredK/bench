import { describe, expect, it } from "vitest"
import {
  AUTO_CHECK_INTERVAL_MS,
  getAutoCheckBackoffMs,
  getNextAutoCheckDelay,
  shouldDeferAutoCheckForConnection,
} from "@/features/updater/services/updater-policy"

describe("updater auto-check policy", () => {
  const now = Date.UTC(2026, 6, 14, 8, 0, 0)

  it("waits 24 hours after a successful check", () => {
    expect(
      getNextAutoCheckDelay(
        {
          autoCheckEnabled: true,
          lastSuccessfulCheckAt: now - 60_000,
          lastFailureAt: 0,
          failureCount: 0,
        },
        now,
      ),
    ).toBe(AUTO_CHECK_INTERVAL_MS - 60_000)
  })

  it("uses bounded exponential backoff after failures", () => {
    expect(getAutoCheckBackoffMs(1)).toBe(15 * 60_000)
    expect(getAutoCheckBackoffMs(2)).toBe(30 * 60_000)
    expect(getAutoCheckBackoffMs(16)).toBe(AUTO_CHECK_INTERVAL_MS)
  })

  it("does not schedule checks after the user disables them", () => {
    expect(
      getNextAutoCheckDelay(
        {
          autoCheckEnabled: false,
          lastSuccessfulCheckAt: 0,
          lastFailureAt: 0,
          failureCount: 0,
        },
        now,
      ),
    ).toBeNull()
  })

  it("defers automatic checks on data saver and very slow connections", () => {
    expect(shouldDeferAutoCheckForConnection({ saveData: true })).toBe(true)
    expect(shouldDeferAutoCheckForConnection({ effectiveType: "2g" })).toBe(true)
    expect(shouldDeferAutoCheckForConnection({ effectiveType: "4g" })).toBe(false)
  })
})
