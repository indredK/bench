/**
 * env-detector use-case tests / 环境检测用例测试 (A4-4):
 *   isAvailable 平台门禁 + scanEnvTools IPC 委托契约。
 */
import { describe, expect, it, vi } from "vitest"

const { scanEnvTools, canUseDesktopFeatures } = vi.hoisted(() => ({
  scanEnvTools: vi.fn(),
  canUseDesktopFeatures: vi.fn(),
}))

vi.mock("@/features/env-detector/services/env-detector.repository", () => ({
  envDetectorRepository: { scanEnvTools },
}))

vi.mock("@/platform/capabilities", () => ({
  canUseDesktopFeatures,
}))

import { envDetectorUseCases } from "@/features/env-detector/services/env-detector.use-cases"

describe("envDetectorUseCases (A4-4)", () => {
  it("reports availability from platform capabilities", () => {
    canUseDesktopFeatures.mockReturnValue(true)
    expect(envDetectorUseCases.isAvailable()).toBe(true)
    canUseDesktopFeatures.mockReturnValue(false)
    expect(envDetectorUseCases.isAvailable()).toBe(false)
  })

  it("delegates scanning to the typed repository and preserves the DTO", async () => {
    const payload = {
      tools: [
        { id: "git", name: "Git", installed: true, version: "2.45.0", path: "/usr/bin/git" },
        { id: "node", name: "Node.js", installed: false, version: null, path: null },
      ],
      unavailable: [],
    }
    scanEnvTools.mockResolvedValue(payload)

    const result = await envDetectorUseCases.scanEnvTools()

    expect(scanEnvTools).toHaveBeenCalledTimes(1)
    expect(result).toEqual(payload)
    expect(result.tools).toHaveLength(2)
  })

  it("propagates IPC failures instead of swallowing them", async () => {
    scanEnvTools.mockRejectedValue({ code: "UNSUPPORTED", message: "not supported" })
    await expect(envDetectorUseCases.scanEnvTools()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    })
  })
})
