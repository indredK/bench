import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import type { PathMtuResult } from "@/lib/tauri/types/network-probe"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) =>
      key === "networkProbe.mtu.meta"
        ? `${options?.ip} · ${options?.method} · ${options?.ms} ms`
        : key === "networkProbe.cmd.mtu"
          ? `probePathMtu(local, '${options?.target}')`
          : key === "networkProbe.mtu.technicalStep"
            ? `${options?.payload}-byte payload: ${options?.detail}`
            : key,
  }),
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

const successfulResult: PathMtuResult = {
  target: "127.0.0.1",
  resolvedIp: "127.0.0.1",
  status: "ok",
  pathMtu: 1500,
  maxPayload: 1472,
  method: "ping-df-binary",
  steps: [{ payloadBytes: 64, ok: true, detail: "ok payload=64" }],
  elapsedMs: 30,
  commandHint: "probePathMtu(local, '127.0.0.1')",
}

afterEach(() => cleanup())

describe("MtuPanel", () => {
  it("localizes method and probe rows while collapsing raw diagnostics", () => {
    render(<MtuPanel loading={false} result={successfulResult} onRun={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("networkProbe.mtu.target"), {
      target: { value: successfulResult.target },
    })

    expect(screen.getByText("networkProbe.mtu.statusValue.ok")).toBeTruthy()
    expect(screen.getByText("127.0.0.1 · networkProbe.mtu.method.binary · 30 ms")).toBeTruthy()
    expect(screen.getByText("networkProbe.mtu.stepDetail.received")).toBeTruthy()

    const details = screen.getByText("networkProbe.mtu.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText("64-byte payload: ok payload=64").closest("details")).toBe(details)
    const command = screen.getAllByText(successfulResult.commandHint)
    expect(command).toHaveLength(1)
    expect(command[0].closest("details")).toBe(details)
    expect(screen.queryByText("ping-df-binary")).toBeNull()
  })

  it("uses localized fallbacks for unknown backend states and methods", () => {
    render(
      <MtuPanel
        loading={false}
        result={{
          ...successfulResult,
          status: "future-status",
          method: "future-method",
          message: "Raw future diagnostic",
        }}
        onRun={vi.fn()}
      />,
    )

    expect(screen.getByText("networkProbe.mtu.statusValue.unknown")).toBeTruthy()
    expect(screen.getByText("127.0.0.1 · networkProbe.mtu.method.unknown · 30 ms")).toBeTruthy()
    expect(screen.getByText("networkProbe.mtu.message.unknown")).toBeTruthy()
    expect(screen.getByText("Raw future diagnostic").closest("details")?.open).toBe(false)
    expect(screen.queryByText("future-status")).toBeNull()
    expect(screen.queryByText("future-method")).toBeNull()
  })
})
