import { afterEach, describe, expect, it, vi } from "vitest"
import { runRegexTestInWorker } from "@/features/dev-toolbox/services/regex-runner"
import type {
  RegexTestRequest,
  RegexTestResult,
} from "@/features/dev-toolbox/services/regex-tester"

const request: RegexTestRequest = { pattern: "\\d+", flags: "g", input: "a1" }

function createFakeWorker() {
  return {
    onmessage: null as ((event: MessageEvent<RegexTestResult>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("runRegexTestInWorker", () => {
  it("returns worker results and terminates the worker", async () => {
    const worker = createFakeWorker()
    const result: RegexTestResult = {
      ok: true,
      matches: [],
      total: 0,
      truncated: false,
      replaced: null,
    }
    worker.postMessage.mockImplementation(() => {
      worker.onmessage?.({ data: result } as MessageEvent<RegexTestResult>)
    })

    await expect(runRegexTestInWorker(request, 100, () => worker)).resolves.toEqual(result)
    expect(worker.postMessage).toHaveBeenCalledWith(request)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onmessage).toBeNull()
  })

  it("terminates a worker that exceeds the execution budget", async () => {
    vi.useFakeTimers()
    const worker = createFakeWorker()
    const result = runRegexTestInWorker(request, 50, () => worker)

    await vi.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(worker.onerror).toBeNull()
  })

  it("reports an unavailable worker without throwing", async () => {
    await expect(
      runRegexTestInWorker(request, 50, () => {
        throw new Error("Worker is unavailable")
      }),
    ).resolves.toEqual({ ok: false, code: "WORKER_UNAVAILABLE" })
  })

  it("rejects oversized requests before cloning them to a worker", async () => {
    const createWorker = vi.fn(() => createFakeWorker())

    await expect(
      runRegexTestInWorker({ ...request, pattern: "x".repeat(4097) }, 50, createWorker),
    ).resolves.toEqual({ ok: false, code: "PATTERN_TOO_LONG" })
    await expect(
      runRegexTestInWorker({ ...request, input: "x".repeat(20001) }, 50, createWorker),
    ).resolves.toEqual({ ok: false, code: "INPUT_TOO_LONG" })
    await expect(
      runRegexTestInWorker({ ...request, replacement: "x".repeat(20001) }, 50, createWorker),
    ).resolves.toEqual({ ok: false, code: "REPLACEMENT_TOO_LONG" })

    expect(createWorker).not.toHaveBeenCalled()
  })

  it("returns a structured failure when the worker reports an error", async () => {
    const worker = createFakeWorker()
    worker.postMessage.mockImplementation(() => {
      worker.onerror?.({} as ErrorEvent)
    })

    await expect(runRegexTestInWorker(request, 100, () => worker)).resolves.toEqual({
      ok: false,
      code: "WORKER_FAILED",
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
