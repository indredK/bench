import {
  MAX_REGEX_INPUT_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
  type RegexTestRequest,
  type RegexTestResult,
} from "./regex-tester"

export const REGEX_TEST_TIMEOUT_MS = 1000

type RegexWorkerPort = Pick<Worker, "onmessage" | "onerror" | "postMessage" | "terminate">
type RegexWorkerFactory = () => RegexWorkerPort

const createRegexWorker: RegexWorkerFactory = () =>
  new Worker(new URL("./regex-worker.ts", import.meta.url), { type: "module" })

const MAX_REGEX_FLAGS_LENGTH = 8

/**
 * Run the native JavaScript RegExp engine away from the UI thread. A timed-out worker is
 * terminated, which is the only reliable way to interrupt catastrophic backtracking.
 */
export function runRegexTestInWorker(
  request: RegexTestRequest,
  timeoutMs = REGEX_TEST_TIMEOUT_MS,
  createWorker: RegexWorkerFactory = createRegexWorker,
): Promise<RegexTestResult> {
  if (request.pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return Promise.resolve({ ok: false, code: "PATTERN_TOO_LONG" })
  }
  if (request.input.length > MAX_REGEX_INPUT_LENGTH) {
    return Promise.resolve({ ok: false, code: "INPUT_TOO_LONG" })
  }
  if (request.replacement !== undefined && request.replacement.length > MAX_REGEX_INPUT_LENGTH) {
    return Promise.resolve({ ok: false, code: "REPLACEMENT_TOO_LONG" })
  }
  if (request.flags.length > MAX_REGEX_FLAGS_LENGTH) {
    return Promise.resolve({ ok: false, code: "INVALID_PATTERN" })
  }
  return new Promise((resolve) => {
    let worker: RegexWorkerPort
    try {
      worker = createWorker()
    } catch {
      resolve({ ok: false, code: "WORKER_UNAVAILABLE" })
      return
    }

    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const finish = (result: RegexTestResult) => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
      resolve(result)
    }

    timeout = setTimeout(() => finish({ ok: false, code: "TIMEOUT" }), timeoutMs)
    worker.onmessage = (event) => finish(event.data)
    worker.onerror = () => finish({ ok: false, code: "WORKER_FAILED" })

    try {
      worker.postMessage(request)
    } catch {
      finish({ ok: false, code: "WORKER_FAILED" })
    }
  })
}
