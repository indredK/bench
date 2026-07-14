import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsSectionState } from "@/features/system-settings/components/SettingsSectionState"
import { useSettingsSectionLoader } from "@/features/system-settings/hooks/useSettingsSectionLoader"
import { useSystemSettingsStore } from "@/features/system-settings/store"

function translate(key: string) {
  return key
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock("@/platform/capabilities", () => ({
  canUseTauriWindow: vi.fn(() => false),
}))

describe("system settings section loading", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSystemSettingsStore.setState({
      loadedSections: new Set<string>(),
    })
  })

  it("coalesces concurrent reload requests", async () => {
    let resolveLoad: (() => void) | undefined
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve
        }),
    )
    const { result } = renderHook(() => useSettingsSectionLoader("display-dock", load))

    await act(async () => {
      const first = result.current.reload(true)
      const second = result.current.reload(true)
      expect(first).toBe(second)
      resolveLoad?.()
      await first
    })

    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe("ready")
  })

  it("skips reload when section data is already cached", async () => {
    useSystemSettingsStore.setState({
      loadedSections: new Set(["display-dock"]),
    })
    const load = vi.fn(async () => undefined)
    const { result } = renderHook(() => useSettingsSectionLoader("display-dock", load))

    await waitFor(() => expect(result.current.status).toBe("ready"))
    expect(load).not.toHaveBeenCalled()
  })

  it("hides untrusted controls after failure and recovers on retry", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("read denied"))
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => useSettingsSectionLoader("lock-screen", load))

    await waitFor(() => expect(result.current.status).toBe("error"))

    const { rerender } = render(
      <SettingsSectionState
        status={result.current.status}
        error={result.current.error}
        onRetry={() => void result.current.reload(true)}
      >
        <button type="button">unsafe default control</button>
      </SettingsSectionState>,
    )

    expect(screen.queryByRole("button", { name: "unsafe default control" })).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toBeInTheDocument()

    await act(async () => {
      await result.current.reload(true)
    })
    rerender(
      <SettingsSectionState
        status={result.current.status}
        error={result.current.error}
        onRetry={() => void result.current.reload(true)}
      >
        <button type="button">unsafe default control</button>
      </SettingsSectionState>,
    )

    expect(screen.getByRole("button", { name: "unsafe default control" })).toBeInTheDocument()
  })
})
