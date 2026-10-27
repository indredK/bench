/**
 * dev-toolbox controller tests / 开发工具箱控制器测试 (A4-4):
 *   子 Tab 切换 + 系统信息懒加载只执行一次 + JSON 工具编排接线。
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { loadSystemInfo, jsonFormat, timestampConvert } = vi.hoisted(() => ({
  loadSystemInfo: vi.fn(),
  jsonFormat: vi.fn(),
  timestampConvert: vi.fn(),
}))

vi.mock("@/features/system-settings/services/system-info.use-cases", () => ({
  systemInfoUseCases: { loadSystemInfo },
}))

vi.mock("@/features/system-settings/services/system-settings.use-cases", () => ({
  systemSettingsUseCases: { jsonFormat, timestampConvert },
}))

vi.mock("@/features/system-settings/hooks/useSettingAction", () => ({
  useSettingAction: () => ({
    run: vi.fn(async (_key: string, action: () => Promise<string>) => action()),
    applying: false,
  }),
}))

import { useDevToolboxController } from "@/features/dev-toolbox/hooks/useDevToolboxController"

beforeEach(() => {
  loadSystemInfo.mockReset().mockResolvedValue({ cpu: "Apple M2", memory: "16GB" })
  jsonFormat.mockReset()
  timestampConvert.mockReset()
})

describe("useDevToolboxController (A4-4)", () => {
  it("starts on the port-manager tab and only lazy-loads system info on the info tab", async () => {
    const { result } = renderHook(() => useDevToolboxController())
    expect(result.current.activeTab).toBe("port-manager")
    expect(loadSystemInfo).not.toHaveBeenCalled()

    act(() => {
      result.current.setActiveTab("info")
    })
    await waitFor(() => expect(result.current.systemInfoLoading).toBe(false))
    expect(loadSystemInfo).toHaveBeenCalledTimes(1)
    expect(result.current.systemInfo).toEqual({ cpu: "Apple M2", memory: "16GB" })

    // 再次切换回 info 不重复加载 (缓存)。
    act(() => {
      result.current.setActiveTab("port-manager")
      result.current.setActiveTab("info")
    })
    await waitFor(() => expect(result.current.activeTab).toBe("info"))
    expect(loadSystemInfo).toHaveBeenCalledTimes(1)
  })

  it("keeps system info error state when loading fails", async () => {
    loadSystemInfo.mockRejectedValue(new Error("ipc down"))
    const { result } = renderHook(() => useDevToolboxController())
    act(() => {
      result.current.setActiveTab("info")
    })
    await waitFor(() => expect(result.current.systemInfoLoading).toBe(false))
    expect(result.current.systemInfoError).toBe("ipc down")
    expect(result.current.systemInfo).toBeNull()
  })

  it("wires the json pretty/minify handlers through the setting action", async () => {
    jsonFormat.mockResolvedValue('{"a":1}')
    const { result } = renderHook(() => useDevToolboxController())

    act(() => {
      result.current.setJsonInput('{"a":1}')
    })
    await act(async () => {
      await result.current.handleJsonPretty()
      await result.current.handleJsonMinify()
    })
    expect(jsonFormat).toHaveBeenCalledWith('{"a":1}', true)
    expect(jsonFormat).toHaveBeenCalledWith('{"a":1}', false)
    expect(result.current.jsonOutput).toBe('{"a":1}')
  })

  it("blocks invalid timestamp input and clears output when input or format changes", async () => {
    timestampConvert.mockResolvedValue("2023-11-14 22:13:20 UTC")
    const { result } = renderHook(() => useDevToolboxController())

    expect(result.current.timestampInputValid).toBe(false)
    expect(result.current.timestampInputError).toBeNull()
    act(() => result.current.touchTimestampInput())
    expect(result.current.timestampInputError).toBe("required")
    act(() => result.current.setTsInput("1700000000"))
    expect(result.current.timestampInputError).toBeNull()

    await act(async () => result.current.handleTimestamp())
    expect(timestampConvert).toHaveBeenCalledWith(1_700_000_000, "datetime")
    expect(result.current.tsOutput).toBe("2023-11-14 22:13:20 UTC")

    act(() => result.current.setTsInput("1700000000tail"))
    expect(result.current.timestampInputError).toBeNull()
    act(() => result.current.touchTimestampInput())
    expect(result.current.timestampInputError).toBe("invalid")
    expect(result.current.tsOutput).toBe("")
    await act(async () => result.current.handleTimestamp())
    expect(timestampConvert).toHaveBeenCalledOnce()

    act(() => result.current.setTsInput("1700000000"))
    await act(async () => result.current.handleTimestamp())
    expect(result.current.tsOutput).toBe("2023-11-14 22:13:20 UTC")

    act(() => result.current.setTsFormat("iso"))
    expect(result.current.tsOutput).toBe("")
  })
})
