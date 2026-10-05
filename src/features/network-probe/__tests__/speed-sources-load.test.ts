import { beforeEach, describe, expect, it, vi } from "vitest"

const { listSpeedSources } = vi.hoisted(() => ({
  listSpeedSources: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { listSpeedSources },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { SpeedSource } from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const sources: SpeedSource[] = [
  {
    id: "source-1",
    name: "Source 1",
    baseUrl: "https://speed.example.test/",
    dlPath: "download",
    ulPath: "upload",
    pingPath: "ping",
  },
]

beforeEach(() => {
  listSpeedSources.mockReset()
  useNetworkProbeStore.setState({
    speedSources: [],
    speedSourcesLoadState: "idle",
    error: null,
  })
})

describe("speed source loading", () => {
  it("coalesces concurrent refreshes and marks the resolved list loaded", async () => {
    const result = deferred<SpeedSource[]>()
    listSpeedSources.mockReturnValue(result.promise)

    const first = networkProbeUseCases.loadSpeedSources()
    expect(useNetworkProbeStore.getState().speedSourcesLoadState).toBe("loading")
    await networkProbeUseCases.loadSpeedSources()
    expect(listSpeedSources).toHaveBeenCalledTimes(1)

    result.resolve(sources)
    await first
    expect(useNetworkProbeStore.getState().speedSources).toEqual(sources)
    expect(useNetworkProbeStore.getState().speedSourcesLoadState).toBe("loaded")
  })

  it("records failure and allows a later successful empty response to recover", async () => {
    listSpeedSources.mockRejectedValueOnce(new Error("source list unavailable"))

    await networkProbeUseCases.loadSpeedSources()

    expect(useNetworkProbeStore.getState().speedSourcesLoadState).toBe("failed")
    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.speedSourcesFailed",
    )

    listSpeedSources.mockResolvedValueOnce([])
    await networkProbeUseCases.loadSpeedSources()

    expect(useNetworkProbeStore.getState().speedSourcesLoadState).toBe("loaded")
    expect(useNetworkProbeStore.getState().speedSources).toEqual([])
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })

  it("preserves the last good source list when refresh fails", async () => {
    listSpeedSources.mockRejectedValueOnce(new Error("source list unavailable"))
    useNetworkProbeStore.setState({ speedSources: sources, speedSourcesLoadState: "loaded" })

    await networkProbeUseCases.loadSpeedSources()

    expect(useNetworkProbeStore.getState().speedSources).toEqual(sources)
    expect(useNetworkProbeStore.getState().speedSourcesLoadState).toBe("failed")
  })
})
