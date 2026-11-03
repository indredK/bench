import { describe, expect, it } from "vitest"

import {
  etaSeconds,
  formatBytes,
  formatEta,
  formatSpeed,
  nextSpeed,
  percentOf,
} from "../services/download-progress"

describe("download progress math", () => {
  it("计算百分比且不伪造未知总量", () => {
    expect(percentOf(50, 200)).toBe(25)
    expect(percentOf(300, 200)).toBe(100)
    expect(percentOf(10, null)).toBeNull()
    expect(percentOf(10, 0)).toBeNull()
  })

  it("速度首个有效样本直接采用，之后平滑", () => {
    const first = nextSpeed({ speed: null, bytes: 0, at: 1000 }, 1000, 2000)
    expect(first).toBe(1000)
    const second = nextSpeed({ speed: first, bytes: 1000, at: 2000 }, 4000, 3000)
    expect(second).toBeCloseTo(0.3 * 3000 + 0.7 * 1000)
  })

  it("样本过密、首个样本时间未知或字节倒退时沿用旧值", () => {
    expect(nextSpeed({ speed: 5, bytes: 10, at: 1000 }, 20, 1010)).toBe(5)
    expect(nextSpeed({ speed: null, bytes: 0, at: 0 }, 20, 1000)).toBeNull()
    expect(nextSpeed({ speed: 5, bytes: 100, at: 1000 }, 50, 2000)).toBe(5)
  })

  it("剩余时间在速度或总量未知时为 null", () => {
    expect(etaSeconds(0, null, 100)).toBeNull()
    expect(etaSeconds(0, 1000, null)).toBeNull()
    expect(etaSeconds(900, 1000, 100)).toBe(1)
    expect(etaSeconds(1000, 1000, 100)).toBe(0)
  })

  it("格式化", () => {
    expect(formatEta(5)).toBe("5s")
    expect(formatEta(65)).toBe("1:05")
    expect(formatEta(3700)).toBe("1h 1m")
    expect(formatEta(null)).toBeNull()
    expect(formatSpeed(2048)).toBe("2.0 KB/s")
    expect(formatSpeed(0)).toBeNull()
    expect(formatBytes(Number.NaN)).toBe("—")
  })
})
