import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"
import type { TracerouteResult } from "@/lib/tauri/types/network-probe"

type OnRun = (target: string, maxTtl: number, rounds: number) => void

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) =>
      key === "networkProbe.traceroute.meta"
        ? `${options?.ip} · ${options?.mode} · ${options?.ms} ms`
        : key,
  }),
}))

vi.mock("@/components/common/CommandHint", () => ({
  CommandHint: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/features/network-probe/components/ProbePanelShell", () => ({
  ProbePanelShell: ({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) => (
    <div>
      {toolbar}
      {children}
    </div>
  ),
}))

function renderPanel(options: { onRun?: OnRun; result?: TracerouteResult | null } = {}) {
  const onRun = options.onRun ?? vi.fn<OnRun>()
  render(
    <TraceroutePanel
      loading={false}
      canCancel={false}
      cancelRequested={false}
      result={options.result ?? null}
      streamingHops={[]}
      toolEnabled
      onRun={onRun}
      onCancel={vi.fn()}
    />,
  )
  return onRun
}

const unprivilegedResult: TracerouteResult = {
  target: "127.0.0.1",
  resolvedIp: "127.0.0.1",
  privilegeMode: "unprivileged",
  hops: [],
  rounds: 1,
  elapsedMs: 1004,
  message: "Completed with unprivileged UDP traceroute (ICMP privileged path unavailable).",
  sessionId: "test-session-id",
  cancelled: false,
  commandHint:
    "startTraceroute(local, '127.0.0.1', {maxTtl:1,rounds:1}) // sessionId=test-session-id",
}

afterEach(() => cleanup())

describe("TraceroutePanel", () => {
  it.each(["0", "33", "1.5", "-1"])("blocks an invalid maximum TTL: %s", (value) => {
    renderPanel()
    const input = screen.getByLabelText("networkProbe.traceroute.maxTtl")
    fireEvent.change(input, { target: { value } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("networkProbe.traceroute.maxTtlInvalid")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "networkProbe.traceroute.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it.each(["0", "11", "1.5", "-1"])("blocks invalid rounds: %s", (value) => {
    renderPanel()
    const input = screen.getByLabelText("networkProbe.traceroute.rounds")
    fireEvent.change(input, { target: { value } })

    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText("networkProbe.traceroute.roundsInvalid")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "networkProbe.traceroute.run" }).hasAttribute("disabled"),
    ).toBe(true)
  })

  it.each([
    ["1", "1"],
    ["32", "10"],
  ])("accepts valid integer boundaries (TTL %s, rounds %s)", (ttl, rounds) => {
    const onRun = renderPanel()
    fireEvent.change(screen.getByLabelText("networkProbe.traceroute.maxTtl"), {
      target: { value: ttl },
    })
    fireEvent.change(screen.getByLabelText("networkProbe.traceroute.rounds"), {
      target: { value: rounds },
    })
    fireEvent.click(screen.getByRole("button", { name: "networkProbe.traceroute.run" }))

    expect(onRun).toHaveBeenCalledWith("1.1.1.1", Number(ttl), Number(rounds))
  })

  it("localizes the unprivileged fallback and collapses raw details", () => {
    renderPanel({ result: unprivilegedResult })

    expect(
      screen.getByText("127.0.0.1 · networkProbe.traceroute.mode.unprivileged · 1004 ms"),
    ).toBeTruthy()
    expect(screen.getByText("networkProbe.traceroute.message.unprivileged")).toBeTruthy()
    const details = screen.getByText("networkProbe.traceroute.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain(unprivilegedResult.message)
    expect(details?.textContent).toContain(unprivilegedResult.commandHint)
  })

  it.each(["future-mode", "constructor"])(
    "localizes unavailable status and keeps unknown mode %s from leaking raw text",
    (privilegeMode) => {
      renderPanel({
        result: {
          ...unprivilegedResult,
          privilegeMode,
          message: "Raw future-mode diagnostic",
        },
      })

      expect(screen.getByText("127.0.0.1 · — · 1004 ms")).toBeTruthy()
      expect(screen.queryByText("networkProbe.traceroute.message.unavailable")).toBeNull()
      const details = screen
        .getByText("networkProbe.traceroute.technicalDetails")
        .closest("details")
      expect(details?.open).toBe(false)
      expect(screen.getByText("Raw future-mode diagnostic").closest("details")).toBe(details)
    },
  )

  it("shows a localized unavailable summary with raw cause inside collapsed details", () => {
    renderPanel({
      result: {
        ...unprivilegedResult,
        privilegeMode: "unavailable",
        hops: [],
        rounds: 0,
        message: "permission denied by the operating system",
      },
    })

    expect(screen.getByText("networkProbe.traceroute.message.unavailable")).toBeTruthy()
    const details = screen.getByText("networkProbe.traceroute.technicalDetails").closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain("permission denied by the operating system")
  })
})
