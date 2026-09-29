import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { installCapabilityPack, listCapabilityPacks, getCapabilities, handlers } = vi.hoisted(
  () => ({
    installCapabilityPack: vi.fn(),
    listCapabilityPacks: vi.fn(),
    getCapabilities: vi.fn(),
    handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  }),
)

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    installCapabilityPack,
    listCapabilityPacks,
    getCapabilities,
  },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      let listeners = handlers.get(event)
      if (!listeners) {
        listeners = new Set()
        handlers.set(event, listeners)
      }
      listeners.add(handler)
      return () => listeners?.delete(handler)
    },
  ),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  handlers.clear()
  installCapabilityPack.mockReset()
  listCapabilityPacks.mockReset().mockResolvedValue([])
  getCapabilities.mockReset().mockResolvedValue({})
  useNetworkProbeStore.setState({
    error: null,
    packProgress: null,
    packProgressText: null,
    commandLog: [],
  })
})

describe("capability pack progress correlation", () => {
  it("ignores progress from another operation and another pack", async () => {
    const install = deferred<{
      packId: string
      ok: boolean
      mode: string
      message: string
      commandHint: string
    }>()
    installCapabilityPack.mockReturnValue(install.promise)

    const task = networkProbeUseCases.installCapabilityPack("pcap-diag")
    await Promise.resolve()
    await Promise.resolve()

    const operationId = installCapabilityPack.mock.calls[0][1] as string
    const listeners = handlers.get(TAURI_EVENTS.networkProbe.packProgress)
    expect(operationId).toMatch(/^[0-9a-f-]{36}$/i)

    act(() => {
      listeners?.forEach((handler) => {
        handler({
          payload: {
            operationId: "another-operation",
            packId: "pcap-diag",
            phase: "downloading",
            bytes: 10,
            totalBytes: 100,
          },
        })
        handler({
          payload: {
            operationId,
            packId: "other-pack",
            phase: "downloading",
            bytes: 20,
            totalBytes: 100,
          },
        })
      })
    })
    expect(useNetworkProbeStore.getState().packProgress).toBeNull()

    act(() => {
      listeners?.forEach((handler) =>
        handler({
          payload: {
            operationId,
            packId: "pcap-diag",
            phase: "downloading",
            bytes: 30,
            totalBytes: 100,
          },
        }),
      )
    })
    expect(useNetworkProbeStore.getState().packProgress).toMatchObject({
      operationId,
      packId: "pcap-diag",
      phase: "downloading",
      bytes: 30,
      totalBytes: 100,
    })

    install.resolve({
      packId: "pcap-diag",
      ok: true,
      mode: "marker",
      message: "Installed",
      commandHint: "done",
    })
    await task
    expect(useNetworkProbeStore.getState().packProgress).toBeNull()
  })

  it("surfaces a backend failure instead of treating it as a successful install", async () => {
    installCapabilityPack.mockResolvedValue({
      packId: "pcap-diag",
      ok: false,
      mode: "failed",
      message: "Download failed: connection timed out",
      commandHint: "installCapabilityPack('pcap-diag') // failed",
    })

    await networkProbeUseCases.installCapabilityPack("pcap-diag")

    const state = useNetworkProbeStore.getState()
    expect(state.error?.key).toBe("networkProbe.errors.packInstallFailed")
    expect(
      state.commandLog.some((line) => line.includes("Download failed: connection timed out")),
    ).toBe(true)
    expect(state.packProgress).toBeNull()
  })
})
