/**
 * dev-toolbox controller tests / 开发工具箱控制器测试 (A4-4):
 *   子 Tab 切换 + 系统信息懒加载只执行一次 + JSON 工具编排接线。
 */
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  loadSystemInfo,
  jsonFormat,
  portCheck,
  base64Encode,
  base64Decode,
  calculateHash,
  generateUuid,
  timestampConvert,
  pingHost,
} = vi.hoisted(() => ({
  loadSystemInfo: vi.fn(),
  jsonFormat: vi.fn(),
  portCheck: vi.fn(),
  base64Encode: vi.fn(),
  base64Decode: vi.fn(),
  calculateHash: vi.fn(),
  generateUuid: vi.fn(),
  timestampConvert: vi.fn(),
  pingHost: vi.fn(),
}))

vi.mock("@/features/system-settings/services/system-info.use-cases", () => ({
  systemInfoUseCases: { loadSystemInfo },
}))

vi.mock("@/features/system-settings/services/system-settings.use-cases", () => ({
  systemSettingsUseCases: {
    jsonFormat,
    portCheck,
    base64Encode,
    base64Decode,
    calculateHash,
    generateUuid,
    timestampConvert,
    pingHost,
  },
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
  portCheck.mockReset()
  base64Encode.mockReset()
  base64Decode.mockReset()
  calculateHash.mockReset()
  generateUuid.mockReset()
  timestampConvert.mockReset()
  pingHost.mockReset()
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

  it("wires the port-check handler through the existing port_check command", async () => {
    portCheck.mockResolvedValue({ host: "example.com", port: 443, open: true, error: null })
    const { result } = renderHook(() => useDevToolboxController())
    act(() => {
      result.current.setDiagnosticTarget("example.com")
      result.current.setDiagnosticPort("443")
    })
    await act(async () => {
      await result.current.handlePortCheck()
    })
    expect(portCheck).toHaveBeenCalledWith("example.com", 443)
    expect(JSON.parse(result.current.diagnosticResult as string)).toEqual({
      host: "example.com",
      port: 443,
      open: true,
      error: null,
    })
  })

  it("wires the base64 encode/decode handlers to their use-cases", async () => {
    base64Encode.mockResolvedValue("aGk=")
    base64Decode.mockResolvedValue("hi")
    const { result } = renderHook(() => useDevToolboxController())
    act(() => result.current.setB64Input("hi"))
    await act(async () => {
      await result.current.handleBase64Encode()
    })
    expect(base64Encode).toHaveBeenCalledWith("hi")
    expect(result.current.b64Output).toBe("aGk=")
    await act(async () => {
      await result.current.handleBase64Decode()
    })
    expect(base64Decode).toHaveBeenCalledWith("hi")
    expect(result.current.b64Output).toBe("hi")
  })

  it("wires the hash handler with the selected algorithm", async () => {
    calculateHash.mockResolvedValue("deadbeef")
    const { result } = renderHook(() => useDevToolboxController())
    act(() => {
      result.current.setHashInput("x")
      result.current.setHashAlgo("sha512")
    })
    await act(async () => {
      await result.current.handleHash()
    })
    expect(calculateHash).toHaveBeenCalledWith("x", "sha512")
    expect(result.current.hashOutput).toBe("deadbeef")
  })

  it("wires uuid and timestamp handlers", async () => {
    generateUuid.mockResolvedValue("uuid-1")
    timestampConvert.mockResolvedValue("2023-11-14")
    const { result } = renderHook(() => useDevToolboxController())
    await act(async () => {
      await result.current.handleUuid()
    })
    expect(generateUuid).toHaveBeenCalledTimes(1)
    expect(result.current.uuidOutput).toBe("uuid-1")

    act(() => {
      result.current.setTsInput("1700000000")
      result.current.setTsFormat("iso")
    })
    await act(async () => {
      await result.current.handleTimestamp()
    })
    expect(timestampConvert).toHaveBeenCalledWith(1700000000, "iso")
    expect(result.current.tsOutput).toBe("2023-11-14")
  })

  it("wires the ping handler through the diagnostic action", async () => {
    pingHost.mockResolvedValue("PING ok")
    const { result } = renderHook(() => useDevToolboxController())
    act(() => result.current.setDiagnosticTarget("8.8.8.8"))
    await act(async () => {
      await result.current.handlePing()
    })
    expect(pingHost).toHaveBeenCalledWith("8.8.8.8", 5)
    expect(result.current.diagnosticResult).toBe("PING ok")
  })
})
