import { describe, expect, it } from "vitest"
import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases"
import type { PortProcessDetail } from "@/lib/tauri/types/port-manager"

function detail(
  port: number,
  pids: number[],
  processTrees: PortProcessDetail["process_trees"] = [],
): PortProcessDetail {
  return {
    port,
    pids,
    process_trees: processTrees,
    fingerprint: null,
    error: null,
  }
}

describe("Port Manager kill use cases", () => {
  it("fails closed when port rows contain conflicting scan identities for one PID", () => {
    const portDetails = [
      detail(
        3000,
        [42],
        [
          {
            pid: 42,
            ppid: 1,
            name: "node",
            command: "node server.js",
            identity: "first-scan-identity",
            has_children: false,
            children: [],
          },
        ],
      ),
      detail(
        8080,
        [42],
        [
          {
            pid: 42,
            ppid: 1,
            name: "node",
            command: "node server.js",
            identity: "second-scan-identity",
            has_children: false,
            children: [],
          },
        ],
      ),
    ]

    expect(portManagerUseCases.buildKillTargets([42], portDetails)).toEqual([
      { pid: 42, expected_name: "node", expected_identity: null },
    ])
  })
  it("builds one kill target per PID and attaches the observed name", () => {
    const portDetails = [
      detail(
        3000,
        [42],
        [
          {
            pid: 42,
            ppid: 1,
            name: "node",
            command: "node server.js",
            identity: "opaque-identity",
            has_children: false,
            children: [],
          },
        ],
      ),
    ]

    expect(portManagerUseCases.buildKillTargets([42, 42], portDetails)).toEqual([
      { pid: 42, expected_name: "node", expected_identity: "opaque-identity" },
    ])
  })

  it("shows a shared PID result on every port where that PID was scanned", () => {
    const result = {
      pid: 42,
      success: false,
      message: "permission denied",
      error_code: "PERMISSION_DENIED",
    }

    expect(
      portManagerUseCases.groupKillResultsByPort(
        [result],
        [detail(3000, [42]), detail(8080, [42]), detail(9000, [99])],
      ),
    ).toEqual({ 3000: [result], 8080: [result] })
  })
})
